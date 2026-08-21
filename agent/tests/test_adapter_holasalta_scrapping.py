import json
import time

from monitor_agent.adapters.holasalta_scrapping import HolaSaltaScrappingAdapter


def _write_state(root, data):
    (root / "data").mkdir(parents=True, exist_ok=True)
    (root / "data" / "runtime_24x7_state.json").write_text(json.dumps(data), encoding="utf-8")


def _adapter(root):
    return HolaSaltaScrappingAdapter(str(root), {"state_file": "data/runtime_24x7_state.json", "stale_heartbeat_seconds": 900})


def test_health_missing_state_is_unreachable(tmp_path):
    assert _adapter(tmp_path).get_health().status == "UNREACHABLE"


def test_health_running_fresh_heartbeat_ok_cycle_is_healthy(tmp_path):
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time(),
                "current_cycle": None,
                "last_cycle": {"status": "ok"},
            }
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "HEALTHY"


def test_health_stale_heartbeat_is_stuck(tmp_path):
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time() - 5000,
                "current_cycle": None,
                "last_cycle": {"status": "ok"},
            }
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "STUCK"


def test_health_stopped_supervisor(tmp_path):
    _write_state(tmp_path, {"supervisor": {"status": "stopped", "last_heartbeat": time.time()}})
    assert _adapter(tmp_path).get_health().status == "STOPPED"


def test_health_partial_last_cycle_is_degraded(tmp_path):
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time(),
                "current_cycle": None,
                "last_cycle": {"status": "partial"},
            }
        },
    )
    health = _adapter(tmp_path).get_health()
    assert health.status == "DEGRADED"


def test_get_runs_maps_script_results_to_stages(tmp_path):
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time(),
                "current_cycle": None,
                "last_cycle": {
                    "cycle_id": "c1",
                    "finished_at": "2026-08-21T01:00:00Z",
                    "success_count": 5,
                    "total_count": 6,
                    "status": "partial",
                    "results": [
                        {"script": "scrape", "label": "Scraping", "ok": True, "started_at": "t0", "finished_at": "t1"},
                        {"script": "wpp", "label": "WhatsApp", "ok": False, "reason": "navigation timeout", "started_at": "t1", "finished_at": "t2"},
                    ],
                },
            }
        },
    )
    runs = _adapter(tmp_path).get_runs(since_iso=None)
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "PARTIAL"
    assert run.error_count == 1
    failed_stage = next(s for s in run.stages if s["name"] == "wpp")
    assert failed_stage["status"] == "FAILED"
    assert failed_stage["error_summary"] == "navigation timeout"


def test_get_runs_converts_real_unix_epoch_timestamps_to_iso(tmp_path):
    # Regression: data/runtime_24x7_state.json's started_at/finished_at
    # are Unix epoch seconds in real production data (confirmed live),
    # not ISO strings as originally assumed -- the cloud's RunRecordSchema
    # rejected a raw int like 1787333418 outright.
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time(),
                "current_cycle": None,
                "last_cycle": {
                    "cycle_id": "20260821_143018",
                    "finished_at": 1787334283,
                    "success_count": 1,
                    "total_count": 1,
                    "status": "ok",
                    "results": [
                        {"script": "scrape", "label": "Scraping", "ok": True, "started_at": 1787333418, "finished_at": 1787333448},
                    ],
                },
            }
        },
    )
    run = _adapter(tmp_path).get_runs(since_iso=None)[0]
    assert run.started_at == "2026-08-21T17:30:18+00:00"
    assert run.finished_at == "2026-08-21T17:44:43+00:00"
    assert run.stages[0]["started_at"] == "2026-08-21T17:30:18+00:00"
    assert run.stages[0]["finished_at"] == "2026-08-21T17:30:48+00:00"


def test_sessions_approximated_from_last_cycle_results(tmp_path):
    _write_state(
        tmp_path,
        {
            "supervisor": {
                "status": "running",
                "last_heartbeat": time.time(),
                "last_cycle": {
                    "finished_at": "2026-08-21T01:00:00Z",
                    "results": [
                        {"script": "wpp", "ok": False, "reason": "navigation timeout"},
                        {"script": "instagram", "ok": True},
                        {"script": "facebook", "ok": True},
                    ],
                },
            }
        },
    )
    sessions = _adapter(tmp_path).get_sessions()
    by_type = {s.session_type: s for s in sessions}
    assert by_type["whatsapp"].status == "browser_error"
    assert by_type["instagram"].status == "authenticated"
    assert "facebook" not in by_type  # not a session-based channel here
