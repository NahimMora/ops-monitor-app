"""Incremental, rotation-aware log tailer.

Handles: rotation (RotatingFileHandler-style — size drop means a new file
generation started), truncation, renamed files, agent restarts (cursor is
persisted via ``state.LogOffsetStore``), UTF-8 with encoding errors
replaced rather than crashing, and a per-call line cap so one huge log
burst can't blow up a single telemetry batch.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from monitor_agent.sanitizer import redact
from monitor_agent.state import LogOffsetStore


@dataclass
class LogLine:
    source: str
    text: str
    byte_offset: int


def _fingerprint(path: Path) -> str:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return "missing"
    # Path + creation time is a stronger rotation signal on Windows than
    # inode (NTFS file IDs aren't reliably exposed via stat here).
    return f"{stat.st_size}:{stat.st_ctime_ns}"


def read_new_lines(
    path: Path,
    offsets: LogOffsetStore,
    *,
    max_lines: int = 500,
    max_bytes: int = 2_000_000,
) -> list[LogLine]:
    if not path.exists():
        return []

    file_key = str(path.resolve())
    current_fingerprint = _fingerprint(path)
    stored = offsets.get(file_key)
    size = path.stat().st_size

    if stored:
        stored_offset = int(stored.get("offset", 0))
        # File shrank (truncated or rotated to a fresh generation) -> restart from 0.
        start_offset = stored_offset if stored_offset <= size else 0
    else:
        # First time this agent has ever seen this file: skip whatever
        # was already in it and start tailing from here on, like any
        # log-shipper's normal "tail -f" behavior. Reading from byte 0 on
        # first sight would dump a project's entire pre-existing log
        # history (observed in practice: one LVR log directory alone
        # produced a single 3,359-event batch on first run, well past the
        # server's per-request cap) instead of only what's actually new
        # since monitoring started.
        start_offset = size

    lines: list[LogLine] = []
    bytes_read = 0
    with path.open("rb") as fh:
        fh.seek(start_offset)
        while True:
            raw_line = fh.readline()
            if not raw_line:
                break
            bytes_read += len(raw_line)
            if bytes_read > max_bytes or len(lines) >= max_lines:
                break
            text = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            if text:
                lines.append(LogLine(source=path.name, text=redact(text), byte_offset=fh.tell()))
        new_offset = fh.tell()

    offsets.set(file_key, new_offset, current_fingerprint)
    return lines


def dedupe_key(source: str, message: str) -> str:
    # Collapses near-identical repeated lines (e.g. the same timeout logged
    # every retry) so LogEvent storage doesn't explode; incident grouping
    # uses a coarser fingerprint (see cloud-side fingerprinting), this is
    # just storage-level dedupe.
    normalized = "".join(ch for ch in message if not ch.isdigit())
    return hashlib.sha1(f"{source}:{normalized}".encode("utf-8")).hexdigest()
