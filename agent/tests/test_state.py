from monitor_agent.state import LogOffsetStore, OfflineBuffer, ProcessedCommandStore


def test_log_offset_store_persists_across_instances(tmp_path):
    path = tmp_path / "offsets.json"
    store = LogOffsetStore(path)
    store.set("C:/LVR/logs/run_24x7.log", 1234, "fp-1")

    reloaded = LogOffsetStore(path)
    assert reloaded.get("C:/LVR/logs/run_24x7.log") == {"offset": 1234, "fingerprint": "fp-1"}


def test_log_offset_store_missing_key_returns_none(tmp_path):
    store = LogOffsetStore(tmp_path / "offsets.json")
    assert store.get("nope") is None


def test_processed_command_store_dedupes_and_persists(tmp_path):
    path = tmp_path / "commands.json"
    store = ProcessedCommandStore(path, max_size=3)
    assert not store.has("cmd-1")
    store.mark("cmd-1")
    assert store.has("cmd-1")

    reloaded = ProcessedCommandStore(path, max_size=3)
    assert reloaded.has("cmd-1")


def test_processed_command_store_evicts_oldest_when_full(tmp_path):
    store = ProcessedCommandStore(tmp_path / "commands.json", max_size=2)
    store.mark("a")
    store.mark("b")
    store.mark("c")  # evicts "a"
    assert not store.has("a")
    assert store.has("b")
    assert store.has("c")


def test_offline_buffer_append_drain_clear(tmp_path):
    buf = OfflineBuffer(tmp_path / "buffer.jsonl", max_events=10)
    assert buf.pending_count() == 0
    buf.append("heartbeat", {"a": 1})
    buf.append("telemetry", {"b": 2})
    assert buf.pending_count() == 2

    drained = buf.drain()
    assert [d["kind"] for d in drained] == ["heartbeat", "telemetry"]

    buf.clear()
    assert buf.pending_count() == 0


def test_offline_buffer_take_removes_only_the_requested_count(tmp_path):
    buf = OfflineBuffer(tmp_path / "buffer.jsonl", max_events=100)
    for i in range(5):
        buf.append("heartbeat", {"i": i})

    taken = buf.take(2)
    assert [t["payload"]["i"] for t in taken] == [0, 1]
    assert buf.pending_count() == 3
    assert [d["payload"]["i"] for d in buf.drain()] == [2, 3, 4]


def test_offline_buffer_take_more_than_available_takes_everything(tmp_path):
    buf = OfflineBuffer(tmp_path / "buffer.jsonl", max_events=100)
    buf.append("heartbeat", {"i": 0})
    buf.append("heartbeat", {"i": 1})

    taken = buf.take(50)
    assert len(taken) == 2
    assert buf.pending_count() == 0


def test_offline_buffer_take_on_empty_buffer_returns_empty(tmp_path):
    buf = OfflineBuffer(tmp_path / "buffer.jsonl", max_events=100)
    assert buf.take(10) == []


def test_offline_buffer_bounded_drops_oldest(tmp_path):
    buf = OfflineBuffer(tmp_path / "buffer.jsonl", max_events=3)
    for i in range(5):
        buf.append("heartbeat", {"i": i})
    drained = buf.drain()
    assert len(drained) == 3
    assert [d["payload"]["i"] for d in drained] == [2, 3, 4]
