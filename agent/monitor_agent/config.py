"""Agent configuration.

Non-secret settings live in a JSON config file (default:
``agent/config.json``, see ``config.example.json``). Secrets
(``AGENT_ID``, ``AGENT_SECRET``, ``CLOUD_BASE_URL``) come from environment
variables — either already set (e.g. by Task Scheduler / the parent
process) or loaded from ``agent/.env`` via python-dotenv.

All default paths are resolved relative to this package's own directory
(``AGENT_DIR``, the ``agent/`` folder), never the process's current
working directory. This matters because the agent can legitimately be
started from three different CWDs — the repo root, the ``agent/``
directory itself, or whatever Windows Task Scheduler happens to set (its
configured ``WorkingDirectory`` is ``C:\\Monitor\\agent``, but that's an
operational detail this module must not assume) — and a CWD-relative
default (e.g. the literal string ``"agent/config.json"``) silently
resolves to the wrong file (``C:\\Monitor\\agent\\agent\\config.json``)
whenever the process is already running from inside ``agent/``.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# monitor_agent/config.py -> monitor_agent/ -> agent/ (this package's root,
# i.e. the directory that holds config.json, .env, and state/ regardless
# of where the process was launched from or what its CWD is).
AGENT_DIR = Path(__file__).resolve().parent.parent

DEFAULT_CONFIG_PATH = AGENT_DIR / "config.json"
DEFAULT_ENV_PATH = AGENT_DIR / ".env"


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


def _resolve_relative_to_agent_dir(value: str) -> Path:
    """Resolves a path from config.json against AGENT_DIR when it's
    relative, so `"state"` always means `agent/state` regardless of CWD.
    An absolute value (e.g. a custom disk location) is left untouched."""
    path = Path(value)
    return path if path.is_absolute() else (AGENT_DIR / path)


def load_config(config_path: str | Path | None = None, *, env_path: str | Path | None = None) -> AgentConfig:
    # override=False: real environment variables (Task Scheduler, an
    # already-exported OPS_AGENT_SECRET, CI, etc.) always win over
    # whatever is in agent/.env — .env is a convenience default, not an
    # override mechanism. Secrets are never logged here or anywhere else
    # in this module.
    dotenv_path = Path(env_path) if env_path is not None else DEFAULT_ENV_PATH
    load_dotenv(dotenv_path=dotenv_path, override=False)

    if config_path is not None:
        path = Path(config_path)
    elif os.environ.get("OPS_AGENT_CONFIG"):
        path = Path(os.environ["OPS_AGENT_CONFIG"])
    else:
        path = DEFAULT_CONFIG_PATH

    if not path.exists():
        raise ConfigError(
            f"Config file not found: {path}. Copy config.example.json to "
            "config.json (in the agent/ directory) and adjust project paths, "
            "then set OPS_AGENT_ID / OPS_AGENT_SECRET / OPS_CLOUD_URL in the "
            "environment (or agent/.env)."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))

    agent_id = os.environ.get("OPS_AGENT_ID") or raw.get("agent_id")
    agent_secret = os.environ.get("OPS_AGENT_SECRET") or raw.get("agent_secret")
    cloud_base_url = os.environ.get("OPS_CLOUD_URL") or raw.get("cloud_base_url")
    if not agent_id or not agent_secret or not cloud_base_url:
        raise ConfigError(
            "OPS_AGENT_ID, OPS_AGENT_SECRET and OPS_CLOUD_URL must be set "
            "(env vars, or agent/.env, take precedence over config.json). "
            "These are secrets and must never be committed."
        )

    state_dir = _resolve_relative_to_agent_dir(raw.get("state_dir", "state"))
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
