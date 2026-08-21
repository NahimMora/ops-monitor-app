"""Command dispatch: whitelist enforcement + idempotent execution.

The agent NEVER executes freeform shell text. A command from the cloud is
a ``(project_slug, command_type)`` pair; this module looks up the
project's adapter, checks ``supported_commands()``, and calls the fixed
handler. If the project doesn't support the requested command, the
command fails loudly instead of silently no-op'ing or improvising.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from monitor_agent.adapters.base import CommandResult, CommandType, ProjectAdapter
from monitor_agent.state import ProcessedCommandStore


@dataclass
class CommandRequest:
    id: str
    project_slug: str
    type: str  # raw string from the API, validated against CommandType


def execute(
    request: CommandRequest,
    adapters: dict[str, ProjectAdapter],
    processed: ProcessedCommandStore,
    params: dict[str, Any] | None = None,
) -> CommandResult:
    if processed.has(request.id):
        return CommandResult(ok=True, result={"note": "already processed (idempotent replay)"})

    try:
        command_type = CommandType(request.type)
    except ValueError:
        result = CommandResult(ok=False, error=f"unknown command type: {request.type!r}")
        processed.mark(request.id)
        return result

    adapter = adapters.get(request.project_slug)
    if adapter is None:
        result = CommandResult(ok=False, error=f"unknown project: {request.project_slug!r}")
        processed.mark(request.id)
        return result

    if command_type not in adapter.supported_commands():
        result = CommandResult(
            ok=False,
            error=f"{request.project_slug} does not support {command_type.value} (whitelist: "
            f"{[c.value for c in adapter.supported_commands()]})",
        )
        processed.mark(request.id)
        return result

    result = adapter.execute_command(command_type, params or {})
    processed.mark(request.id)
    return result
