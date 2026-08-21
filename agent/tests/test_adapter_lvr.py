import json

from monitor_agent.adapters.lvr import LvrAdapter


def _write_heartbeat(root, data):
    (root / "data").mkdir(parents=True, exist_ok=True)
    (root / "data" / "supervisor_heartbeat.json").write_text(json.dumps(data), encoding="utf-8")


def _adapter(root):
    return LvrAdapter(str(root), {"heartbeat_file": "data/supervisor_heartbeat.json", "stale_heartbeat_seconds": 900})


def test_health_missing_heartbeat_is_unreachable(tmp_path):
    adapter = _adapter(tmp_path)
    health = adapter.get_health()
    assert health.status == "UNREACHABLE"


def test_health_fresh_success_cycle_is_healthy(tmp_path):
    _write_heartbeat(
        tmp_path,
        {
            "supervisor": {"status": "running", "pid": 123},
            "heartbeat": {"status": "fresh", "age_seconds": 5},
            "last_cycle": {"status": "success"},
            "stages": [],
            "exit_code": 0,
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "HEALTHY"
    assert health.reason is None


def test_health_stale_heartbeat_is_stuck(tmp_path):
    _write_heartbeat(
        tmp_path,
        {
            "supervisor": {"status": "running"},
            "heartbeat": {"status": "stale", "age_seconds": 5000},
            "last_cycle": {"status": "success"},
            "stages": [],
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "STUCK"
    assert "stale" in health.reason


def test_health_failed_cycle_is_failed(tmp_path):
    _write_heartbeat(
        tmp_path,
        {
            "supervisor": {"status": "running"},
            "heartbeat": {"status": "fresh", "age_seconds": 1},
            "last_cycle": {"status": "failed"},
            "stages": [],
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "FAILED"


def test_get_runs_normalizes_stage_statuses(tmp_path):
    _write_heartbeat(
        tmp_path,
        {
            "supervisor": {"status": "running"},
            "heartbeat": {"status": "fresh", "age_seconds": 1, "cycle_started_at": "2026-08-21T01:00:00Z", "cycle_finished_at": "2026-08-21T01:06:00Z"},
            "last_cycle": {"cycle_id": "42", "status": "degraded"},
            "stages": [
                {"stage": "facebook", "status": "degraded", "received": 8, "succeeded": 6, "failed": 2, "duration_seconds": 39},
                {"stage": "instagram", "status": "success", "received": 5, "succeeded": 5, "failed": 0, "duration_seconds": 339},
            ],
            "exit_code": 2,
            "deployment": {},
        },
    )
    runs = _adapter(tmp_path).get_runs(since_iso=None)
    assert len(runs) == 1
    run = runs[0]
    assert run.external_run_id == "42"
    assert run.status == "DEGRADED"
    assert run.items_total == 13
    assert run.items_success == 11
    assert run.items_failed == 2
    assert {s["name"] for s in run.stages} == {"facebook", "instagram"}


def test_no_sessions_reported_for_lvr(tmp_path):
    assert _adapter(tmp_path).get_sessions() == []


def test_supported_commands_excludes_run_now(tmp_path):
    from monitor_agent.adapters.base import CommandType

    supported = _adapter(tmp_path).supported_commands()
    assert CommandType.RUN_NOW not in supported
    assert CommandType.START in supported
    assert CommandType.STOP in supported
