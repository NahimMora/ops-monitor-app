"""Regression tests for the offline-buffer flush cooldown/cap fix.

Real bug found running the agent against this machine's actual production
setup: heartbeat_loop, telemetry_loop, and commands_loop each call
_flush_offline_buffer() independently on their own schedule, and with a
backlog built up during an outage, each call used to retry the entire
buffer — three overlapping loops doing that easily exceeds the cloud's
per-path rate limit, and the resulting 429s just get buffered right back
in, so the backlog could never drain.
"""

from __future__ import annotations

import time
from pathlib import Path

from monitor_agent.api_client import ApiError
from monitor_agent.config import AgentConfig, ProjectConfig
from monitor_agent.main import FLUSH_COOLDOWN_SECONDS, MAX_FLUSH_ITEMS_PER_ATTEMPT, Agent


def _make_agent(tmp_path: Path) -> Agent:
    config = AgentConfig(
        agent_id="test-agent",
        agent_secret="test-secret",
        cloud_base_url="https://ops.example.com",
        hostname="TEST-HOST",
        state_dir=tmp_path / "state",
        heartbeat_interval_seconds=12,
        telemetry_interval_seconds=20,
        commands_poll_interval_seconds=4,
        machine_health_interval_seconds=20,
        request_timeout_seconds=10,
        max_offline_buffer_events=5000,
        projects=(ProjectConfig(slug="lvr", display_name="LVR", adapter="lvr", root_path=str(tmp_path)),),
    )
    return Agent(config)


class FakeMethod:
    """Stand-in for an ApiClient method: records calls, fails until told to succeed."""

    def __init__(self, fail: bool = True):
        self.fail = fail
        self.calls: list[dict] = []

    def __call__(self, payload):
        self.calls.append(payload)
        if self.fail:
            raise ApiError(status_code=429, message="rate limited")


def test_flush_respects_cooldown_across_repeated_calls(tmp_path):
    agent = _make_agent(tmp_path)
    fake_heartbeat = FakeMethod(fail=False)
    agent.client.heartbeat = fake_heartbeat

    for i in range(3):
        agent.offline_buffer.append("heartbeat", {"i": i})

    # First call within the cooldown window actually flushes...
    agent._flush_offline_buffer()
    assert len(fake_heartbeat.calls) == 3

    # ...but immediately calling it again (simulating another loop
    # calling it moments later) must NOT re-hit the network at all.
    agent._flush_offline_buffer()
    agent._flush_offline_buffer()
    assert len(fake_heartbeat.calls) == 3  # unchanged


def test_flush_caps_items_retried_per_attempt(tmp_path):
    agent = _make_agent(tmp_path)
    fake_heartbeat = FakeMethod(fail=False)
    agent.client.heartbeat = fake_heartbeat

    total_items = MAX_FLUSH_ITEMS_PER_ATTEMPT + 15
    for i in range(total_items):
        agent.offline_buffer.append("heartbeat", {"i": i})

    agent._flush_offline_buffer()

    assert len(fake_heartbeat.calls) == MAX_FLUSH_ITEMS_PER_ATTEMPT
    assert agent.offline_buffer.pending_count() == total_items - MAX_FLUSH_ITEMS_PER_ATTEMPT


def test_items_that_still_fail_are_put_back_not_dropped(tmp_path):
    agent = _make_agent(tmp_path)
    fake_heartbeat = FakeMethod(fail=True)
    agent.client.heartbeat = fake_heartbeat

    agent.offline_buffer.append("heartbeat", {"i": 0})
    agent._flush_offline_buffer()

    assert agent.offline_buffer.pending_count() == 1  # requeued, not lost


def test_after_cooldown_elapses_flushing_resumes(tmp_path, monkeypatch):
    agent = _make_agent(tmp_path)
    fake_heartbeat = FakeMethod(fail=False)
    agent.client.heartbeat = fake_heartbeat
    agent.offline_buffer.append("heartbeat", {"i": 0})

    agent._flush_offline_buffer()
    assert len(fake_heartbeat.calls) == 1

    agent.offline_buffer.append("heartbeat", {"i": 1})
    # Simulate real time having passed past the cooldown window.
    agent._last_flush_attempt = time.monotonic() - FLUSH_COOLDOWN_SECONDS - 1
    agent._flush_offline_buffer()
    assert len(fake_heartbeat.calls) == 2
