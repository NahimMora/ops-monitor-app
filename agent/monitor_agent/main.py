"""Agent entry point.

Runs four independent loops on their own intervals (heartbeat, telemetry,
commands polling, machine health) in separate threads so a slow adapter
call never delays heartbeats. Every outbound call goes through
``send_or_buffer``: on failure, the payload is appended to the local
offline buffer instead of being lost, and buffered payloads are flushed
first on every successful cycle — this is what makes "observability fails
open" true even across multi-hour outages.
"""

from __future__ import annotations

import json
import logging
import signal
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from monitor_agent.adapters.base import ProjectAdapter
from monitor_agent.adapters.registry import build_adapter
from monitor_agent.api_client import ApiClient, ApiError
from monitor_agent.collectors.log_tailer import dedupe_key, read_new_lines
from monitor_agent.collectors.machine import collect_machine_snapshot
from monitor_agent.commands.executor import CommandRequest, execute
from monitor_agent.config import AgentConfig, load_config
from monitor_agent.state import LogOffsetStore, OfflineBuffer, ProcessedCommandStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("monitor_agent")

_KIND_TO_METHOD = {
    "heartbeat": "heartbeat",
    "telemetry": "telemetry",
    "events_batch": "events_batch",
    "logs_batch": "logs_batch",
    "runs": "runs",
}


class Agent:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.client = ApiClient(config)
        self.offline_buffer = OfflineBuffer(config.offline_buffer_path, config.max_offline_buffer_events)
        self.processed_commands = ProcessedCommandStore(config.processed_commands_path)
        self.log_offsets = LogOffsetStore(config.offset_store_path)
        self.adapters: dict[str, ProjectAdapter] = {
            p.slug: build_adapter(p.adapter, p.root_path, p.options) for p in config.projects
        }
        self._stop = threading.Event()

    # -- outbound send with offline fallback --------------------------------

    def send_or_buffer(self, kind: str, payload: dict[str, Any]) -> None:
        method_name = _KIND_TO_METHOD[kind]
        method = getattr(self.client, method_name)
        try:
            self._flush_offline_buffer()
            method(payload)
        except ApiError as exc:
            log.warning("send failed (%s), buffering: %s", kind, exc)
            self.offline_buffer.append(kind, payload)

    def _flush_offline_buffer(self) -> None:
        pending = self.offline_buffer.drain()
        if not pending:
            return
        log.info("flushing %d buffered events", len(pending))
        remaining = []
        for item in pending:
            method = getattr(self.client, _KIND_TO_METHOD[item["kind"]])
            try:
                method(item["payload"])
            except ApiError:
                remaining.append(item)
        self.offline_buffer.clear()
        for item in remaining:
            self.offline_buffer.append(item["kind"], item["payload"])

    # -- loops ----------------------------------------------------------------

    def heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            payload = {
                "agent_id": self.config.agent_id,
                "hostname": self.config.hostname,
                "sent_at": _now_iso(),
                "offline_buffer_pending": self.offline_buffer.pending_count(),
                "project_health": {
                    slug: _health_to_dict(adapter.get_health()) for slug, adapter in self.adapters.items()
                },
            }
            self._safe_call(lambda: self.send_or_buffer("heartbeat", payload))
            self._stop.wait(self.config.heartbeat_interval_seconds)

    def machine_health_loop(self) -> None:
        while not self._stop.is_set():
            snapshot = collect_machine_snapshot()
            self._safe_call(
                lambda: self.send_or_buffer(
                    "telemetry", {"agent_id": self.config.agent_id, "machine": snapshot.to_dict()}
                )
            )
            self._stop.wait(self.config.machine_health_interval_seconds)

    def telemetry_loop(self) -> None:
        while not self._stop.is_set():
            for slug, adapter in self.adapters.items():
                events: list[dict[str, Any]] = []

                scheduler_states = self._safe_get(adapter.get_scheduler_state, [])
                sessions = self._safe_get(adapter.get_sessions, [])
                runs = self._safe_get(lambda: adapter.get_runs(since_iso=None), [])

                for source in self._safe_get(adapter.get_log_sources, []):
                    from pathlib import Path

                    for line in read_new_lines(Path(source), self.log_offsets):
                        events.append(
                            {
                                "project_slug": slug,
                                "occurred_at": _now_iso(),
                                "level": _guess_level(line.text),
                                "source": line.source,
                                "message": line.text,
                                "dedupe_key": dedupe_key(line.source, line.text),
                            }
                        )

                self._safe_call(
                    lambda: self.send_or_buffer(
                        "telemetry",
                        {
                            "agent_id": self.config.agent_id,
                            "project_slug": slug,
                            "scheduler_state": [s.__dict__ for s in scheduler_states],
                            "sessions": [s.__dict__ for s in sessions],
                        },
                    )
                )
                if runs:
                    self._safe_call(
                        lambda: self.send_or_buffer(
                            "runs", {"agent_id": self.config.agent_id, "project_slug": slug, "runs": [r.__dict__ for r in runs]}
                        )
                    )
                if events:
                    self._safe_call(
                        lambda: self.send_or_buffer("events_batch", {"agent_id": self.config.agent_id, "events": events})
                    )
            self._stop.wait(self.config.telemetry_interval_seconds)

    def commands_loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._flush_offline_buffer()
                response = self.client.get_commands()
                for raw in response.get("commands", []):
                    request = CommandRequest(id=raw["id"], project_slug=raw["project_slug"], type=raw["type"])
                    log.info("executing command %s: %s/%s", request.id, request.project_slug, request.type)
                    result = execute(request, self.adapters, self.processed_commands, raw.get("params"))
                    self._safe_call(
                        lambda: self.client.post_command_result(
                            request.id,
                            {
                                "ok": result.ok,
                                "result": result.result,
                                "exit_code": result.exit_code,
                                "error": result.error,
                                "finished_at": _now_iso(),
                            },
                        )
                    )
            except ApiError as exc:
                log.debug("commands poll failed (will retry): %s", exc)
            self._stop.wait(self.config.commands_poll_interval_seconds)

    # -- helpers ----------------------------------------------------------------

    def _safe_call(self, fn) -> None:
        try:
            fn()
        except Exception:  # noqa: BLE001 - a single failed collector/send must never kill the loop
            log.exception("unhandled error in agent loop step")

    def _safe_get(self, fn, default):
        try:
            return fn()
        except Exception:  # noqa: BLE001
            log.exception("adapter call failed")
            return default

    def run(self) -> None:
        log.info("Ops Monitor Agent %s starting for host %s", self.config.agent_id, self.config.hostname)
        threads = [
            threading.Thread(target=self.heartbeat_loop, name="heartbeat", daemon=True),
            threading.Thread(target=self.telemetry_loop, name="telemetry", daemon=True),
            threading.Thread(target=self.commands_loop, name="commands", daemon=True),
            threading.Thread(target=self.machine_health_loop, name="machine_health", daemon=True),
        ]
        for t in threads:
            t.start()

        def _handle_signal(signum, frame):  # noqa: ANN001
            log.info("received signal %s, shutting down", signum)
            self._stop.set()

        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)

        while not self._stop.is_set():
            time.sleep(0.5)
        for t in threads:
            t.join(timeout=5)
        log.info("agent stopped cleanly")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _health_to_dict(health) -> dict[str, Any]:
    return {"status": health.status, "reason": health.reason, "heartbeat_age_seconds": health.heartbeat_age_seconds}


def _guess_level(text: str) -> str:
    lowered = text.lower()
    if "error" in lowered or "traceback" in lowered or "exception" in lowered:
        return "ERROR"
    if "warn" in lowered:
        return "WARNING"
    return "INFO"


def main() -> None:
    config = load_config()
    Agent(config).run()


if __name__ == "__main__":
    main()
