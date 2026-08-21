"""Regression test reproducing the exact context install-agent.ps1 uses
to start the agent via Windows Task Scheduler:

    Executable:        C:\\Monitor\\agent\\.venv\\Scripts\\python.exe
    Working directory: C:\\Monitor\\agent

This is a real subprocess, launched with that working directory, that
performs exactly the steps `Agent.__init__` performs in main.py — find
config.json, load .env, resolve the state dir, import the package, build
the three project adapters — using ONLY the default (no-argument)
resolution, the same way `python -m monitor_agent.main` would. It
deliberately stops short of `Agent.run()`'s infinite loop / background
threads (which poll the cloud and would need a real network), since
nothing about that loop is configuration-path-resolution behavior — this
test is about proving bootstrap works from that exact CWD, not about
running the agent forever. No project command is executed and no network
call is made.

Any pre-existing real `config.json` / `.env` in agent/ (a developer's
local setup) is backed up and restored, never overwritten permanently.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

from monitor_agent.config import AGENT_DIR

BOOTSTRAP_SCRIPT = textwrap.dedent(
    """
    import json
    from monitor_agent.config import load_config
    from monitor_agent.adapters.registry import build_adapter

    config = load_config()  # no args: exercises the exact default resolution
    adapters = {
        p.slug: build_adapter(p.adapter, p.root_path, p.options)
        for p in config.projects
    }
    print("BOOTSTRAP_OK " + json.dumps({
        "adapter_slugs": sorted(adapters.keys()),
        "state_dir": str(config.state_dir),
        "hostname": config.hostname,
    }))
    """
)


def _backup(path: Path) -> Path | None:
    if not path.exists():
        return None
    backup_path = path.with_suffix(path.suffix + ".test-backup")
    path.rename(backup_path)
    return backup_path


def _restore(path: Path, backup_path: Path | None) -> None:
    if path.exists():
        path.unlink()
    if backup_path is not None:
        backup_path.rename(path)


def test_agent_bootstraps_from_the_real_task_scheduler_cwd(tmp_path):
    real_config_path = AGENT_DIR / "config.json"
    real_env_path = AGENT_DIR / ".env"
    config_backup = _backup(real_config_path)
    env_backup = _backup(real_env_path)

    state_dir = tmp_path / "state"

    try:
        real_config_path.write_text(
            json.dumps(
                {
                    "hostname": "TEST-TASKSCHED-HOST",
                    "state_dir": str(state_dir),
                    "projects": [
                        {
                            "slug": "holasalta-manager",
                            "display_name": "HolaSalta Ops Backend",
                            "adapter": "holasalta_manager",
                            "root_path": "C:\\\\nonexistent\\\\WebApp_HolaSalta",
                            "options": {"health_url": "http://127.0.0.1:1/health"},
                        },
                        {
                            "slug": "lvr",
                            "display_name": "LVR AutoPublicador",
                            "adapter": "lvr",
                            "root_path": "C:\\\\nonexistent\\\\LVR",
                            "options": {},
                        },
                        {
                            "slug": "holasalta-scrapping",
                            "display_name": "HolaSalta AutoPublicador",
                            "adapter": "holasalta_scrapping",
                            "root_path": "C:\\\\nonexistent\\\\Scrapping_HolaSalta",
                            "options": {},
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        real_env_path.write_text(
            "OPS_AGENT_ID=test-agent\nOPS_AGENT_SECRET=test-secret\nOPS_CLOUD_URL=https://ops.example.com\n",
            encoding="utf-8",
        )

        proc = subprocess.run(
            [sys.executable, "-c", BOOTSTRAP_SCRIPT],
            cwd=str(AGENT_DIR),  # exactly what install-agent.ps1 configures as WorkingDirectory
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert proc.returncode == 0, f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
        assert "BOOTSTRAP_OK" in proc.stdout
        payload = json.loads(proc.stdout.split("BOOTSTRAP_OK ", 1)[1])
        assert payload["adapter_slugs"] == ["holasalta-manager", "holasalta-scrapping", "lvr"]
        assert payload["state_dir"] == str(state_dir)
        assert payload["hostname"] == "TEST-TASKSCHED-HOST"
        # No secret value ever appears in stdout/stderr.
        assert "test-secret" not in proc.stdout
        assert "test-secret" not in proc.stderr
    finally:
        _restore(real_config_path, config_backup)
        _restore(real_env_path, env_backup)
