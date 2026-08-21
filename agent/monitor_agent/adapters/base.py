"""Project adapter contract.

Every monitored project is wrapped by one adapter implementing this
interface. Adapters translate a project's own structured state (already
existing files/CLIs/health endpoints — see docs/PROJECT_INTEGRATIONS.md)
into the normalized shapes the cloud API expects. No adapter shells out to
an arbitrary command; ``execute_command`` dispatches to a fixed, explicit
handler per ``AgentCommandType``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol


class CommandType(str, Enum):
    START = "START"
    STOP = "STOP"
    RESTART = "RESTART"
    RUN_NOW = "RUN_NOW"
    PAUSE_SCHEDULE = "PAUSE_SCHEDULE"
    RESUME_SCHEDULE = "RESUME_SCHEDULE"


@dataclass
class ProjectHealth:
    status: str  # matches ProjectStatus enum values in the DB (upper snake case)
    reason: str | None
    heartbeat_age_seconds: float | None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class SessionStatus:
    session_type: str
    status: str  # authenticated | expired | challenge | browser_error | unknown
    checked_at: str  # ISO 8601 UTC
    reason: str | None = None


@dataclass
class SchedulerTaskState:
    task_name: str
    enabled: bool
    state: str
    last_run_at: str | None
    last_run_result: str | None
    next_run_at: str | None


@dataclass
class RunRecord:
    external_run_id: str | None
    started_at: str
    finished_at: str | None
    status: str
    trigger: str | None
    items_total: int | None
    items_success: int | None
    items_failed: int | None
    current_stage: str | None
    error_count: int
    warning_count: int
    stages: list[dict[str, Any]]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CommandResult:
    ok: bool
    result: dict[str, Any] = field(default_factory=dict)
    exit_code: int | None = None
    error: str | None = None


class ProjectAdapter(Protocol):
    slug: str

    def get_health(self) -> ProjectHealth: ...

    def get_runs(self, *, since_iso: str | None) -> list[RunRecord]: ...

    def get_scheduler_state(self) -> list[SchedulerTaskState]: ...

    def get_sessions(self) -> list[SessionStatus]: ...

    def get_log_sources(self) -> list[str]: ...

    def get_current_activity(self) -> dict[str, Any]: ...

    def supported_commands(self) -> list[CommandType]: ...

    def execute_command(self, command_type: CommandType, params: dict[str, Any]) -> CommandResult: ...
