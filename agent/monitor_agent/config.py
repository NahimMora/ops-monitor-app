"""Agent configuration.

Non-secret settings live in a JSON config file (default:
``agent/config.json``, see ``config.example.json``). Secrets
(``AGENT_ID``, ``AGENT_SECRET``, ``CLOUD_BASE_URL``) come from environment
variables only — never written to the config file or logs.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProjectConfig:
    slug: str
    display_name: str
    adapter: str
    root_path: str
    options: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str
    agent_secret: str
    cloud_base_url: str
    hostname: str
    state_dir: Path
    heartbeat_interval_seconds: float
    telemetry_interval_seconds: float
    commands_poll_interval_seconds: float
    machine_health_interval_seconds: float
    request_timeout_seconds: float
    max_offline_buffer_events: int
    projects: tuple[ProjectConfig, ...]

    @property
    def offset_store_path(self) -> Path:
        return self.state_dir / "log_offsets.json"

    @property
    def processed_commands_path(self) -> Path:
        return self.state_dir / "processed_commands.json"

    @property
    def offline_buffer_path(self) -> Path:
        return self.state_dir / "offline_buffer.jsonl"

    @property
    def agent_identity_path(self) -> Path:
        return self.state_dir / "agent_identity.json"


def load_config(config_path: str | Path | None = None) -> AgentConfig:
    path = Path(config_path or os.environ.get("OPS_AGENT_CONFIG", "agent/config.json"))
    if not path.exists():
        raise ConfigError(
            f"Config file not found: {path}. Copy config.example.json to "
            "config.json and adjust project paths, then set OPS_AGENT_ID / "
            "OPS_AGENT_SECRET / OPS_CLOUD_URL in the environment (or agent/.env)."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))

    agent_id = os.environ.get("OPS_AGENT_ID") or raw.get("agent_id")
    agent_secret = os.environ.get("OPS_AGENT_SECRET") or raw.get("agent_secret")
    cloud_base_url = os.environ.get("OPS_CLOUD_URL") or raw.get("cloud_base_url")
    if not agent_id or not agent_secret or not cloud_base_url:
        raise ConfigError(
            "OPS_AGENT_ID, OPS_AGENT_SECRET and OPS_CLOUD_URL must be set "
            "(env vars take precedence over config.json). These are secrets "
            "and must never be committed."
        )

    state_dir = Path(raw.get("state_dir", "agent/state"))
    state_dir.mkdir(parents=True, exist_ok=True)

    projects = tuple(
        ProjectConfig(
            slug=p["slug"],
            display_name=p["display_name"],
            adapter=p["adapter"],
            root_path=p["root_path"],
            options=p.get("options", {}),
        )
        for p in raw.get("projects", [])
    )
    if not projects:
        raise ConfigError("config.json must declare at least one project")

    return AgentConfig(
        agent_id=agent_id,
        agent_secret=agent_secret,
        cloud_base_url=cloud_base_url.rstrip("/"),
        hostname=raw.get("hostname") or os.environ.get("COMPUTERNAME", "unknown-host"),
        state_dir=state_dir,
        heartbeat_interval_seconds=float(raw.get("heartbeat_interval_seconds", 12)),
        telemetry_interval_seconds=float(raw.get("telemetry_interval_seconds", 20)),
        commands_poll_interval_seconds=float(raw.get("commands_poll_interval_seconds", 4)),
        machine_health_interval_seconds=float(raw.get("machine_health_interval_seconds", 20)),
        request_timeout_seconds=float(raw.get("request_timeout_seconds", 10)),
        max_offline_buffer_events=int(raw.get("max_offline_buffer_events", 5000)),
        projects=projects,
    )
