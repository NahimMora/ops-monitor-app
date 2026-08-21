"""Adapter for Project A — HolaSalta Ops Backend (WebApp_HolaSalta).

Read-only by design (see docs/PROJECT_INTEGRATIONS.md §0): a separate,
already-live system (`ops-web-app`) owns start/stop/restart for this
backend. This adapter only reads the existing ``/health`` contract and
reports on the scheduler task that keeps that other system's supervisor
alive — it never issues commands.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from monitor_agent.adapters.base import (
    CommandResult,
    CommandType,
    ProjectAdapter,
    ProjectHealth,
    RunRecord,
    SchedulerTaskState,
    SessionStatus,
)
from monitor_agent.collectors.scheduler import get_task_state

# ops-web-app's own CLAUDE.md documents these as the real values returned
# by /health today — NOT "healthy", which was a stale stub value a past
# bug compared against. Keep this in sync if that contract changes.
_HEALTHY_STATUSES = {"running"}


class HolaSaltaManagerAdapter:
    slug = "holasalta-manager"

    def __init__(self, root_path: str, options: dict[str, Any]) -> None:
        self._root_path = root_path
        self._health_url = options["health_url"]
        self._scheduler_task_name = options.get("scheduler_task_name")
        self._stale_seconds = float(options.get("stale_heartbeat_seconds", 60))

    def get_health(self) -> ProjectHealth:
        try:
            resp = requests.get(self._health_url, timeout=5)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            return ProjectHealth(
                status="OFFLINE",
                reason=f"health endpoint unreachable: {exc.__class__.__name__}",
                heartbeat_age_seconds=None,
                raw={},
            )

        status = str(data.get("status", "unknown"))
        platforms = data.get("platforms", {}) or {}
        ages = [
            p.get("heartbeat_age_seconds")
            for p in platforms.values()
            if isinstance(p, dict) and p.get("heartbeat_age_seconds") is not None
        ]
        max_age = max(ages) if ages else None

        needs_auth = any(p.get("needs_auth") for p in platforms.values() if isinstance(p, dict))
        watchdog = data.get("watchdog", {}) or {}

        if status in _HEALTHY_STATUSES and not needs_auth:
            normalized = "RUNNING" if max_age is not None and max_age > self._stale_seconds else "HEALTHY"
            reason = None
        elif needs_auth:
            normalized = "DEGRADED"
            reason = "one or more platform sessions need re-authentication"
        elif status == "degraded":
            normalized = "DEGRADED"
            reason = "backend reports degraded status"
        elif status == "stopped":
            normalized = "STOPPED"
            reason = "backend reports stopped status"
        else:
            normalized = "UNKNOWN"
            reason = f"unrecognized backend status: {status!r}"

        if watchdog and not watchdog.get("alive", True):
            normalized = "STUCK"
            reason = "watchdog reports not alive"

        return ProjectHealth(status=normalized, reason=reason, heartbeat_age_seconds=max_age, raw=data)

    def get_runs(self, *, since_iso: str | None) -> list[RunRecord]:
        # No discrete run/history endpoint exists yet for this project
        # (see docs/PROJECT_INTEGRATIONS.md §A) — it's monitored as a
        # continuous service, not discrete pipeline runs.
        return []

    def get_scheduler_state(self) -> list[SchedulerTaskState]:
        if not self._scheduler_task_name:
            return []
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
        try:
            resp = requests.get(self._health_url, timeout=5)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException:
            return []

        checked_at = datetime.now(timezone.utc).isoformat()
        sessions: list[SessionStatus] = []
        for name, info in (data.get("platforms") or {}).items():
            if not isinstance(info, dict):
                continue
            if info.get("needs_auth"):
                status = "expired"
            elif info.get("browser_connected"):
                status = "authenticated"
            else:
                status = "browser_error"
            sessions.append(
                SessionStatus(
                    session_type=name,
                    status=status,
                    checked_at=checked_at,
                    reason=None if status == "authenticated" else f"worker_status={info.get('worker_status')}",
                )
            )
        return sessions

    def get_log_sources(self) -> list[str]:
        # Not instrumented for this project (see §A) — health/session
        # signal comes from /health, not log tailing.
        return []

    def get_current_activity(self) -> dict[str, Any]:
        try:
            resp = requests.get(self._health_url, timeout=5)
            resp.raise_for_status()
            return {"health": resp.json()}
        except requests.RequestException:
            return {}

    def supported_commands(self) -> list[CommandType]:
        return []

    def execute_command(self, command_type: CommandType, params: dict[str, Any]) -> CommandResult:
        return CommandResult(
            ok=False,
            error=(
                "Project A (HolaSalta Manager) is read-only in Ops Monitor by design — "
                "start/stop/restart is owned exclusively by the existing ops-web-app supervisor."
            ),
        )
