"""Windows Task Scheduler collector.

Shells out to PowerShell's ``Get-ScheduledTask`` / ``Get-ScheduledTaskInfo``
(read-only) rather than parsing ``schtasks`` text output, and converts to
JSON so we get exact field names. This is the only supported way this
agent talks to Task Scheduler for *reading* state; pause/resume commands
(see commands/executor.py) use ``Enable-ScheduledTask`` /
``Disable-ScheduledTask`` explicitly, never freeform PowerShell.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone


@dataclass
class TaskState:
    task_name: str
    enabled: bool
    state: str
    last_run_at: str | None
    last_run_result: str | None
    next_run_at: str | None

    def to_dict(self) -> dict:
        return asdict(self)


_PS_SCRIPT = """
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName '{task_name}' -ErrorAction Stop
$info = $task | Get-ScheduledTaskInfo
[PSCustomObject]@{{
    TaskName = $task.TaskName
    Enabled = $task.Settings.Enabled
    State = $task.State.ToString()
    LastRunTime = $info.LastRunTime
    LastTaskResult = $info.LastTaskResult
    NextRunTime = $info.NextRunTime
}} | ConvertTo-Json -Compress
"""


def get_task_state(task_name: str, timeout_seconds: float = 10) -> TaskState | None:
    script = _PS_SCRIPT.format(task_name=task_name.replace("'", "''"))
    try:
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None

    last_run = data.get("LastRunTime")
    next_run = data.get("NextRunTime")
    return TaskState(
        task_name=data.get("TaskName", task_name),
        enabled=bool(data.get("Enabled")),
        state=data.get("State", "Unknown"),
        last_run_at=_normalize_dotnet_date(last_run),
        last_run_result=_task_result_to_string(data.get("LastTaskResult")),
        next_run_at=_normalize_dotnet_date(next_run),
    )


def set_task_enabled(task_name: str, enabled: bool, timeout_seconds: float = 10) -> bool:
    cmdlet = "Enable-ScheduledTask" if enabled else "Disable-ScheduledTask"
    script = f"{cmdlet} -TaskName '{task_name.replace(chr(39), chr(39) * 2)}' | Out-Null"
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    return proc.returncode == 0


_DOTNET_DATE_PATTERN = re.compile(r"^/Date\((-?\d+)\)/$")


def _normalize_dotnet_date(value: object) -> str | None:
    # Real production output from Get-ScheduledTaskInfo | ConvertTo-Json
    # on this machine (Windows PowerShell 5.1) is the legacy WCF/JavaScript
    # "/Date(1787283944000)/" format (milliseconds since epoch), NOT an
    # ISO-like string as originally assumed here -- confirmed by an actual
    # buffered telemetry payload that the cloud API rejected because
    # `new Date("/Date(...)/ ")` is not a parseable date. Converted to ISO
    # 8601 UTC so the wire contract (SchedulerTaskStateSchema, always a
    # real date string) holds regardless of which format Windows chose.
    if not value:
        return None
    text = str(value)
    match = _DOTNET_DATE_PATTERN.match(text)
    if match:
        millis = int(match.group(1))
        return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).isoformat()
    return text


def _task_result_to_string(code: object) -> str | None:
    if code is None:
        return None
    try:
        code_int = int(code)
    except (TypeError, ValueError):
        return str(code)
    if code_int == 0:
        return "success"
    if code_int == 267009:
        return "running"
    if code_int == 267011:
        return "never_run"
    return f"error_0x{code_int & 0xFFFFFFFF:08x}"
