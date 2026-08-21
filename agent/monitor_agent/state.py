"""Local persistent state: log cursors, processed command ids, offline buffer.

Everything here is designed so the agent can be killed and restarted
without losing its place — no in-memory-only state matters for
correctness. See docs/WINDOWS_AGENT.md ("Restart without losing cursor").
"""

from __future__ import annotations

import json
import os
import tempfile
from collections import OrderedDict
from pathlib import Path
from typing import Any


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


class LogOffsetStore:
    """Tracks, per log file, the byte offset already ingested and an
    identity fingerprint (inode/size-at-rotation proxy on Windows: device
    id is unreliable, so we key on absolute path + file creation time) so
    a truncated/rotated/renamed file is detected instead of silently
    skipped or double-read.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._data: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            self._data = json.loads(self._path.read_text(encoding="utf-8"))

    def get(self, file_key: str) -> dict[str, Any] | None:
        return self._data.get(file_key)

    def set(self, file_key: str, offset: int, fingerprint: str) -> None:
        self._data[file_key] = {"offset": offset, "fingerprint": fingerprint}
        _atomic_write_json(self._path, self._data)


class ProcessedCommandStore:
    """Bounded LRU set of command ids already executed, so a retried
    ``GET /api/agent/commands`` response (e.g. after a network blip right
    after posting the result) never re-executes a command.
    """

    def __init__(self, path: Path, max_size: int = 2000) -> None:
        self._path = path
        self._max_size = max_size
        self._ids: OrderedDict[str, bool] = OrderedDict()
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            for cid in json.loads(self._path.read_text(encoding="utf-8")):
                self._ids[cid] = True

    def _save(self) -> None:
        _atomic_write_json(self._path, list(self._ids.keys()))

    def has(self, command_id: str) -> bool:
        return command_id in self._ids

    def mark(self, command_id: str) -> None:
        if command_id in self._ids:
            self._ids.move_to_end(command_id)
        else:
            self._ids[command_id] = True
            while len(self._ids) > self._max_size:
                self._ids.popitem(last=False)
        self._save()


class OfflineBuffer:
    """Append-only JSONL buffer for events that couldn't be sent because
    the cloud/internet was unreachable. Bounded by ``max_events`` (oldest
    dropped first) so a long outage can never grow unbounded or block the
    monitored projects — observability fails open, never the other way.
    """

    def __init__(self, path: Path, max_events: int) -> None:
        self._path = path
        self._max_events = max_events

    def append(self, kind: str, payload: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"kind": kind, "payload": payload}) + "\n")
        self._trim_if_needed()

    def _trim_if_needed(self) -> None:
        if not self._path.exists():
            return
        lines = self._path.read_text(encoding="utf-8").splitlines()
        if len(lines) > self._max_events:
            trimmed = lines[-self._max_events :]
            self._path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")

    def drain(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []
        lines = self._path.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in lines if line.strip()]

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()

    def pending_count(self) -> int:
        if not self._path.exists():
            return 0
        return sum(1 for line in self._path.read_text(encoding="utf-8").splitlines() if line.strip())
