"""Adapter for Project C — HolaSalta AutoPublicador (Scrapping_HolaSalta).

No CLI/health contract exists for this project (see
docs/PROJECT_INTEGRATIONS.md §C) — everything is derived from
``data/runtime_24x7_state.json``, written by the project's own
``utils/runtime_supervisor.py``. Control is pure process lifecycle: start
a new interpreter, or terminate the existing process tree — which mirrors
exactly what a human operator does today and is already tolerated by the
project's own crash-recovery logic on next start.
"""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any

import psutil

from monitor_agent.adapters.base import (
    CommandResult,
    CommandType,
    ProjectAdapter,
    ProjectHealth,
    RunRecord,
    SchedulerTaskState,
    SessionStatus,
)
from monitor_agent.collectors.scheduler import get_task_state, set_task_enabled

_SCRIPT_LABELS = {"scrape": "Scraping", "web": "Web", "instagram": "Instagram", "facebook": "Facebook", "wpp": "WhatsApp", "x": "X"}


class HolaSaltaScrappingAdapter:
    slug = "holasalta-scrapping"

    def __init__(self, root_path: str, options: dict[str, Any]) -> None:
        self._root = Path(root_path)
        self._state_path = self._root / options.get("state_file", "data/runtime_24x7_state.json")
        self._scheduler_task_name = options.get("scheduler_task_name", "HolaSalta-24x7")
        self._python_exe = self._root / options.get("python_exe", "venv\\Scripts\\python.exe")
        self._entrypoint = options.get("entrypoint", "run_24x7.py")
        self._stale_seconds = float(options.get("stale_heartbeat_seconds", 900))

    def _read_state(self) -> dict[str, Any] | None:
        if not self._state_path.exists():
            return None
        try:
            return json.loads(self._state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    def get_health(self) -> ProjectHealth:
        data = self._read_state()
        if data is None:
            return ProjectHealth(status="UNREACHABLE", reason="state file missing/unreadable", heartbeat_age_seconds=None, raw={})

        supervisor = data.get("supervisor", {}) or {}
        last_heartbeat = supervisor.get("last_heartbeat")
        age = (time.time() - last_heartbeat) if last_heartbeat else None
        status = supervisor.get("status")

        if status == "stopped":
            normalized, reason = "STOPPED", "supervisor.status=stopped"
        elif age is not None and age > self._stale_seconds:
            normalized, reason = "STUCK", f"heartbeat stale ({age:.0f}s > {self._stale_seconds:.0f}s threshold)"
        elif status == "running":
            last_cycle = supervisor.get("last_cycle") or {}
            normalized = "RUNNING" if supervisor.get("current_cycle") else ("HEALTHY" if last_cycle.get("status") == "ok" else "DEGRADED")
            reason = None if normalized != "DEGRADED" else "last cycle status was partial"
        else:
            normalized, reason = "UNKNOWN", f"unrecognized supervisor.status={status!r}"

        return ProjectHealth(status=normalized, reason=reason, heartbeat_age_seconds=age, raw=data)

    def get_runs(self, *, since_iso: str | None) -> list[RunRecord]:
        data = self._read_state()
        if not data:
            return []
        supervisor = data.get("supervisor", {}) or {}
        last_cycle = supervisor.get("last_cycle")
        if not last_cycle:
            return []

        stages = []
        for result in last_cycle.get("results", []) or []:
            stages.append(
                {
                    "name": result.get("script"),
                    "display_name": _SCRIPT_LABELS.get(result.get("script"), result.get("label")),
                    "status": "SUCCESS" if result.get("ok") else "FAILED",
                    "started_at": result.get("started_at"),
                    "finished_at": result.get("finished_at"),
                    "error_summary": result.get("reason") if not result.get("ok") else None,
                }
            )

        overall = "SUCCESS" if last_cycle.get("status") == "ok" else "PARTIAL"

        return [
            RunRecord(
                external_run_id=str(last_cycle.get("cycle_id", "")),
                started_at=stages[0]["started_at"] if stages else "",
                finished_at=last_cycle.get("finished_at"),
                status=overall,
                trigger="scheduled",
                items_total=last_cycle.get("total_count"),
                items_success=last_cycle.get("success_count"),
                items_failed=(last_cycle.get("total_count", 0) - last_cycle.get("success_count", 0))
                if last_cycle.get("total_count") is not None
                else None,
                current_stage=supervisor.get("current_script") if supervisor.get("current_cycle") else None,
                error_count=sum(1 for s in stages if s["status"] == "FAILED"),
                warning_count=0,
                stages=stages,
            )
        ]

    def get_scheduler_state(self) -> list[SchedulerTaskState]:
        task = get_task_state(self._scheduler_task_name)
        if not task:
            return []
        return [
            SchedulerTaskState(
                task_name=task.task_name,
                enabled=task.enabled,
                state=task.state,
                last_run_at=task.last_run_at,
                last_run_result=task.last_run_result,
                next_run_at=task.next_run_at,
            )
        ]

    def get_sessions(self) -> list[SessionStatus]:
        # No safe read-only session probe exists (Selenium-driven, see
        # §C) — approximated from the most recent per-platform result
        # instead of touching the browser.
        data = self._read_state()
        if not data:
            return []
        last_cycle = (data.get("supervisor") or {}).get("last_cycle") or {}
        checked_at_source = last_cycle.get("finished_at")
        sessions = []
        for result in last_cycle.get("results", []) or []:
            script = result.get("script")
            if script not in ("wpp", "instagram"):
                continue
            status = "authenticated" if result.get("ok") else "browser_error"
            sessions.append(
                SessionStatus(
                    session_type="whatsapp" if script == "wpp" else "instagram",
                    status=status,
                    checked_at=checked_at_source or "",
                    reason=result.get("reason"),
                )
            )
        return sessions

    def get_log_sources(self) -> list[str]:
        logs_dir = self._root / "logs"
        if not logs_dir.exists():
            return []
        return [str(p) for p in logs_dir.glob("*.log")]

    def get_current_activity(self) -> dict[str, Any]:
        return self._read_state() or {}

    def supported_commands(self) -> list[CommandType]:
        return [
            CommandType.START,
            CommandType.STOP,
            CommandType.RESTART,
            CommandType.PAUSE_SCHEDULE,
            CommandType.RESUME_SCHEDULE,
        ]

    def _find_running_pid(self) -> int | None:
        target = str((self._root / self._entrypoint).resolve()).lower()
        for proc in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmdline = " ".join(proc.info.get("cmdline") or []).lower()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            if self._entrypoint.lower() in cmdline and "python" in cmdline:
                return proc.info["pid"]
        return None

    def execute_command(self, command_type: CommandType, params: dict[str, Any]) -> CommandResult:
        if command_type == CommandType.START:
            if self._find_running_pid() is not None:
                return CommandResult(ok=True, result={"note": "already running"})
            try:
                subprocess.Popen(
                    [str(self._python_exe), "-u", self._entrypoint],
                    cwd=str(self._root),
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                )
            except OSError as exc:
                return CommandResult(ok=False, error=str(exc))
            return CommandResult(ok=True, result={"note": "start requested"})

        if command_type == CommandType.STOP:
            pid = self._find_running_pid()
            if pid is None:
                return CommandResult(ok=True, result={"note": "not running"})
            try:
                psutil.Process(pid).terminate()
            except psutil.NoSuchProcess:
                return CommandResult(ok=True, result={"note": "already stopped"})
            except psutil.AccessDenied as exc:
                return CommandResult(ok=False, error=str(exc))
            return CommandResult(ok=True, result={"note": f"terminated pid {pid}"})

        if command_type == CommandType.RESTART:
            stop_result = self.execute_command(CommandType.STOP, {})
            if not stop_result.ok:
                return stop_result
            time.sleep(2)
            return self.execute_command(CommandType.START, {})

        if command_type == CommandType.PAUSE_SCHEDULE:
            ok = set_task_enabled(self._scheduler_task_name, enabled=False)
            return CommandResult(ok=ok, result={"task": self._scheduler_task_name, "enabled": False})

        if command_type == CommandType.RESUME_SCHEDULE:
            ok = set_task_enabled(self._scheduler_task_name, enabled=True)
            return CommandResult(ok=ok, result={"task": self._scheduler_task_name, "enabled": True})

        return CommandResult(ok=False, error=f"unsupported command for holasalta-scrapping: {command_type}")
