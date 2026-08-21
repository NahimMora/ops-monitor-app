"""Machine vitals collector: CPU, RAM, disk, uptime, Chrome/Chromium
processes. Uses psutil — no invented metrics; anything not reliably
available on Windows (e.g. hardware temperature) is reported as
``None`` and the API/UI must render that as "Unavailable", never a fake 0.
"""

from __future__ import annotations

import platform
import socket
import time
from dataclasses import asdict, dataclass
from typing import Any

import psutil

_CHROME_NAMES = {"chrome.exe", "chromium.exe", "msedge.exe", "headless_shell.exe"}


@dataclass
class MachineSnapshot:
    hostname: str
    os_version: str
    boot_time_iso: str
    uptime_seconds: float
    cpu_percent: float
    ram_total_mb: int
    ram_used_mb: int
    ram_free_mb: int
    disk_total_mb: int
    disk_used_mb: int
    disk_free_mb: int
    chrome_process_count: int
    chrome_memory_mb: int
    local_time_iso: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def collect_machine_snapshot(disk_path: str = "C:\\") -> MachineSnapshot:
    boot_ts = psutil.boot_time()
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage(disk_path)

    chrome_count = 0
    chrome_mem = 0
    for proc in psutil.process_iter(["name", "memory_info"]):
        try:
            name = (proc.info.get("name") or "").lower()
            if name in _CHROME_NAMES:
                chrome_count += 1
                mem_info = proc.info.get("memory_info")
                if mem_info:
                    chrome_mem += mem_info.rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    now = time.time()
    return MachineSnapshot(
        hostname=socket.gethostname(),
        os_version=platform.platform(),
        boot_time_iso=_to_iso(boot_ts),
        uptime_seconds=now - boot_ts,
        cpu_percent=psutil.cpu_percent(interval=0.3),
        ram_total_mb=mem.total // (1024 * 1024),
        ram_used_mb=mem.used // (1024 * 1024),
        ram_free_mb=mem.available // (1024 * 1024),
        disk_total_mb=disk.total // (1024 * 1024),
        disk_used_mb=disk.used // (1024 * 1024),
        disk_free_mb=disk.free // (1024 * 1024),
        chrome_process_count=chrome_count,
        chrome_memory_mb=chrome_mem // (1024 * 1024),
        local_time_iso=_to_iso(now),
    )


def _to_iso(ts: float) -> str:
    import datetime as _dt

    return _dt.datetime.fromtimestamp(ts, tz=_dt.timezone.utc).isoformat()
