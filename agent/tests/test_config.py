"""Regression tests for config.py's path resolution and .env loading.

These specifically guard against the bug fixed in this pass: defaults
that were relative to the process's CWD (breaking when Task Scheduler's
WorkingDirectory is already `agent/`) instead of relative to the
package's own directory.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from monitor_agent.config import AGENT_DIR, ConfigError, _resolve_relative_to_agent_dir, load_config


def test_agent_dir_is_the_real_agent_directory_regardless_of_cwd():
    # AGENT_DIR is derived from config.py's own __file__, so it can never
    # drift with the process's current working directory the way a
    # literal relative string like "agent/config.json" would.
    expected = Path(__file__).resolve().parent.parent
    assert AGENT_DIR == expected
    assert (AGENT_DIR / "monitor_agent").is_dir()


def test_resolve_relative_to_agent_dir_keeps_absolute_paths_untouched(tmp_path):
    absolute = tmp_path / "custom-state"
    assert _resolve_relative_to_agent_dir(str(absolute)) == absolute


def test_resolve_relative_to_agent_dir_anchors_relative_paths_at_agent_dir():
    assert _resolve_relative_to_agent_dir("state") == AGENT_DIR / "state"
    # The old default ("agent/state") must NOT double up now that the
    # anchor itself is already the agent/ directory.
    assert _resolve_relative_to_agent_dir("state") != AGENT_DIR / "agent" / "state"


def _write_config(path: Path, *, state_dir: str) -> None:
    path.write_text(
        json.dumps(
            {
                "hostname": "TEST-HOST",
                "state_dir": state_dir,
                "projects": [
                    {"slug": "p1", "display_name": "P1", "adapter": "lvr", "root_path": "C:\\nonexistent"},
                ],
            }
        ),
        encoding="utf-8",
    )


def test_load_config_missing_file_raises_clear_error(tmp_path):
    with pytest.raises(ConfigError, match="Config file not found"):
        load_config(config_path=tmp_path / "does-not-exist.json", env_path=tmp_path / "unused.env")


def test_load_config_requires_agent_secrets(tmp_path, monkeypatch):
    monkeypatch.delenv("OPS_AGENT_ID", raising=False)
    monkeypatch.delenv("OPS_AGENT_SECRET", raising=False)
    monkeypatch.delenv("OPS_CLOUD_URL", raising=False)

    config_path = tmp_path / "config.json"
    _write_config(config_path, state_dir=str(tmp_path / "state"))

    with pytest.raises(ConfigError, match="OPS_AGENT_ID"):
        load_config(config_path=config_path, env_path=tmp_path / "empty.env")


def test_load_config_loads_secrets_from_env_file(tmp_path, monkeypatch):
    monkeypatch.delenv("OPS_AGENT_ID", raising=False)
    monkeypatch.delenv("OPS_AGENT_SECRET", raising=False)
    monkeypatch.delenv("OPS_CLOUD_URL", raising=False)

    config_path = tmp_path / "config.json"
    _write_config(config_path, state_dir=str(tmp_path / "state"))

    env_path = tmp_path / ".env"
    env_path.write_text(
        "OPS_AGENT_ID=from-dotenv\nOPS_AGENT_SECRET=dotenv-secret\nOPS_CLOUD_URL=https://ops.example.com\n",
        encoding="utf-8",
    )

    config = load_config(config_path=config_path, env_path=env_path)
    assert config.agent_id == "from-dotenv"
    assert config.agent_secret == "dotenv-secret"
    assert config.cloud_base_url == "https://ops.example.com"


def test_real_environment_variables_take_priority_over_dotenv_file(tmp_path, monkeypatch):
    # override=False: a real env var (Task Scheduler, CI, an operator's
    # shell) must win over agent/.env, never the other way around.
    monkeypatch.setenv("OPS_AGENT_ID", "from-real-env")
    monkeypatch.setenv("OPS_AGENT_SECRET", "real-env-secret")
    monkeypatch.setenv("OPS_CLOUD_URL", "https://real.example.com")

    config_path = tmp_path / "config.json"
    _write_config(config_path, state_dir=str(tmp_path / "state"))

    env_path = tmp_path / ".env"
    env_path.write_text(
        "OPS_AGENT_ID=from-dotenv\nOPS_AGENT_SECRET=dotenv-secret\nOPS_CLOUD_URL=https://dotenv.example.com\n",
        encoding="utf-8",
    )

    config = load_config(config_path=config_path, env_path=env_path)
    assert config.agent_id == "from-real-env"
    assert config.agent_secret == "real-env-secret"
    assert config.cloud_base_url == "https://real.example.com"


def test_state_dir_relative_path_resolves_against_agent_dir_not_cwd(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_AGENT_ID", "id")
    monkeypatch.setenv("OPS_AGENT_SECRET", "secret")
    monkeypatch.setenv("OPS_CLOUD_URL", "https://ops.example.com")

    config_path = tmp_path / "config.json"
    _write_config(config_path, state_dir="a-relative-state-dir")

    # Run from a totally unrelated CWD to prove the resolution doesn't
    # depend on it.
    unrelated_cwd = tmp_path / "somewhere-else"
    unrelated_cwd.mkdir()
    monkeypatch.chdir(unrelated_cwd)

    try:
        config = load_config(config_path=config_path, env_path=tmp_path / "empty.env")
        assert config.state_dir == AGENT_DIR / "a-relative-state-dir"
    finally:
        # Clean up the directory this test necessarily creates under the
        # real AGENT_DIR (state_dir.mkdir() side effect of load_config).
        created = AGENT_DIR / "a-relative-state-dir"
        if created.is_dir():
            created.rmdir()


def test_state_dir_absolute_path_is_used_as_is(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_AGENT_ID", "id")
    monkeypatch.setenv("OPS_AGENT_SECRET", "secret")
    monkeypatch.setenv("OPS_CLOUD_URL", "https://ops.example.com")

    absolute_state_dir = tmp_path / "state"
    config_path = tmp_path / "config.json"
    _write_config(config_path, state_dir=str(absolute_state_dir))

    config = load_config(config_path=config_path, env_path=tmp_path / "empty.env")
    assert config.state_dir == absolute_state_dir
    assert absolute_state_dir.is_dir()


def test_default_config_path_points_at_agent_dir_config_json():
    from monitor_agent.config import DEFAULT_CONFIG_PATH

    assert DEFAULT_CONFIG_PATH == AGENT_DIR / "config.json"
    assert DEFAULT_CONFIG_PATH.parent == AGENT_DIR
