"""Adapter for Project B — LVR AutoPublicador (C:\\LVR).

Prefers reading the existing structured heartbeat file directly
(``data/supervisor_heartbeat.json``, the same data ``cli.py status --json``
re-derives) over shelling out for every poll. Commands map onto the
project's real, existing levers only — see
docs/PROJECT_INTEGRATIONS.md §B for exactly what is/isn't supported.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

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

_STAGE_STATUS_MAP = {
    "success": "SUCCESS",
    "no_work": "NO_WORK",
    "degraded": "DEGRADED",
    "failed": "FAILED",
    "blocked": "BLOCKED",
}


class LvrAdapter:
    slug = "lvr"

    def __init__(self, root_path: str, options: dict[str, Any]) -> None:
        self._root = Path(root_path)
        self._heartbeat_path = self._root / options.get("heartbeat_file", "data/supervisor_heartbeat.json")
        self._scheduler_task_name = options.get("scheduler_task_name", "LaVozRiojana-24x7")
        self._python_exe = self._root / options.get("python_exe", "venv\\Scripts\\python.exe")
        self._cli_script = options.get("cli_script", "cli.py")
        self._stale_seconds = float(options.get("stale_heartbeat_seconds", 900))

    def _read_heartbeat(self) -> dict[str, Any] | None:
        if not self._heartbeat_path.exists():
            return None
        try:
            return json.loads(self._heartbeat_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    def get_health(self) -> ProjectHealth:
        data = self._read_heartbeat()
        if data is None:
            return ProjectHealth(status="UNREACHABLE", reason="heartbeat file missing/unreadable", heartbeat_age_seconds=None, raw={})

        heartbeat = data.get("heartbeat", {}) or {}
        supervisor = data.get("supervisor", {}) or {}
        age = heartbeat.get("age_seconds")
        hb_status = heartbeat.get("status")

        if supervisor.get("status") not in ("running",) and hb_status != "fresh":
            normalized = "STOPPED"
            reason = f"supervisor.status={supervisor.get('status')!r}"
        elif age is not None and age > self._stale_seconds:
            normalized = "STUCK"
            reason = f"heartbeat stale ({age:.0f}s > {self._stale_seconds:.0f}s threshold)"
        else:
            last_cycle = data.get("last_cycle") or {}
            cycle_status = last_cycle.get("status")
            normalized = {
                "success": "HEALTHY",
                "no_work": "IDLE",
                "degraded": "DEGRADED",
                "failed": "FAILED",
                "blocked": "STUCK",
            }.get(cycle_status, "RUNNING" if supervisor.get("status") == "running" else "UNKNOWN")
            reason = None

        return ProjectHealth(status=normalized, reason=reason, heartbeat_age_seconds=age, raw=data)

    def get_runs(self, *, since_iso: str | None) -> list[RunRecord]:
        data = self._read_heartbeat()
        if not data:
            return []
        last_cycle = data.get("last_cycle")
        if not last_cycle:
            return []

        stages = []
        for stage in data.get("stages", []) or []:
            stages.append(
                {
                    "name": stage.get("stage"),
                    "status": _STAGE_STATUS_MAP.get(stage.get("status"), "UNKNOWN"),
                    "items_total": stage.get("received"),
                    "items_success": stage.get("succeeded"),
                    "items_failed": stage.get("failed"),
                    "duration_seconds": stage.get("duration_seconds"),
                    "error_summary": stage.get("error_type"),
                }
            )

        exit_code = data.get("exit_code")
        overall = {0: "SUCCESS", 1: "FAILED", 2: "DEGRADED", 3: "BLOCKED"}.get(exit_code, "UNKNOWN")

        return [
            RunRecord(
                external_run_id=str(last_cycle.get("cycle_id") or last_cycle.get("id") or ""),
                started_at=data.get("heartbeat", {}).get("cycle_started_at") or "",
                finished_at=data.get("heartbeat", {}).get("cycle_finished_at"),
                status=overall,
                trigger="scheduled",
                items_total=sum(s.get("items_total") or 0 for s in stages) or None,
                items_success=sum(s.get("items_success") or 0 for s in stages) or None,
                items_failed=sum(s.get("items_failed") or 0 for s in stages) or None,
                current_stage=None,
                error_count=sum(1 for s in stages if s["status"] == "FAILED"),
                warning_count=sum(1 for s in stages if s["status"] == "DEGRADED"),
                stages=stages,
                metadata={"deployment": data.get("deployment", {})},
            )
        ]

    def get_scheduler_state(self) -> list[SchedulerTaskState]:
        results = []
        for name in filter(None, [self._scheduler_task_name]):
            task = get_task_state(name)
            if task:
                results.append(
                    SchedulerTaskState(
                        task_name=task.task_name,
                        enabled=task.enabled,
                        state=task.state,
                        last_run_at=task.last_run_at,
                        last_run_result=task.last_run_result,
                        next_run_at=task.next_run_at,
                    )
                )
        return results

    def get_sessions(self) -> list[SessionStatus]:
        # No browser/Playwright sessions in LVR — Facebook/Instagram
        # publish via the Graph API. Nothing to report.
        return []

    def get_log_sources(self) -> list[str]:
        logs_dir = self._root / "logs"
        if not logs_dir.exists():
            return []
        return [str(p) for p in logs_dir.glob("*.log")]

    def get_current_activity(self) -> dict[str, Any]:
        return self._read_heartbeat() or {}

    def supported_commands(self) -> list[CommandType]:
        return [
            CommandType.START,
            CommandType.STOP,
            CommandType.RESTART,
            CommandType.PAUSE_SCHEDULE,
            CommandType.RESUME_SCHEDULE,
        ]

    def execute_command(self, command_type: CommandType, params: dict[str, Any]) -> CommandResult:
        if command_type == CommandType.START:
            return self._run_cli("start")
        if command_type == CommandType.STOP:
            return self._run_cli("stop")
        if command_type == CommandType.RESTART:
            stop_result = self._run_cli("stop")
            if not stop_result.ok:
                return stop_result
            return self._run_cli("start")
        if command_type == CommandType.PAUSE_SCHEDULE:
            ok = set_task_enabled(self._scheduler_task_name, enabled=False)
            return CommandResult(ok=ok, result={"task": self._scheduler_task_name, "enabled": False})
        if command_type == CommandType.RESUME_SCHEDULE:
            ok = set_task_enabled(self._scheduler_task_name, enabled=True)
            return CommandResult(ok=ok, result={"task": self._scheduler_task_name, "enabled": True})
        return CommandResult(ok=False, error=f"unsupported command for lvr: {command_type}")

    def _run_cli(self, subcommand: str) -> CommandResult:
        try:
            proc = subprocess.run(
                [str(self._python_exe), self._cli_script, subcommand],
                cwd=str(self._root),
                capture_output=True,
                text=True,
                timeout=60,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return CommandResult(ok=False, error=str(exc))
        return CommandResult(
            ok=proc.returncode == 0,
            exit_code=proc.returncode,
            result={"stdout_tail": proc.stdout[-2000:], "stderr_tail": proc.stderr[-2000:]},
            error=None if proc.returncode == 0 else f"cli.py {subcommand} exited {proc.returncode}",
        )
