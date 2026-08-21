from pathlib import Path

from monitor_agent.collectors.log_tailer import dedupe_key, read_new_lines
from monitor_agent.state import LogOffsetStore


def test_first_sight_of_a_file_skips_pre_existing_content(tmp_path):
    # Regression: reading from byte 0 on first sight of a file with real
    # production history dumped a 3,359-line backlog in one batch on the
    # agent's actual first run against C:\LVR's logs — well past the
    # server's per-request event cap. First sight must behave like
    # `tail -f`, not `cat`.
    log_path = tmp_path / "preexisting.log"
    log_path.write_text("old line 1\nold line 2\nold line 3\n", encoding="utf-8")
    offsets = LogOffsetStore(tmp_path / "offsets.json")

    first = read_new_lines(log_path, offsets)
    assert first == []

    with log_path.open("a", encoding="utf-8") as fh:
        fh.write("new line\n")

    second = read_new_lines(log_path, offsets)
    assert [l.text for l in second] == ["new line"]


def test_reads_only_new_lines_since_last_offset(tmp_path):
    log_path = tmp_path / "app.log"
    offsets = LogOffsetStore(tmp_path / "offsets.json")

    # Establish a baseline offset first (this file "already existed" as
    # far as the offset store is concerned) so this test is specifically
    # about incremental reads, not first-sight behavior (covered above).
    log_path.write_text("", encoding="utf-8")
    read_new_lines(log_path, offsets)

    with log_path.open("a", encoding="utf-8") as fh:
        fh.write("line1\nline2\n")
    first = read_new_lines(log_path, offsets)
    assert [l.text for l in first] == ["line1", "line2"]

    with log_path.open("a", encoding="utf-8") as fh:
        fh.write("line3\n")

    second = read_new_lines(log_path, offsets)
    assert [l.text for l in second] == ["line3"]


def test_survives_restart_via_persisted_offsets(tmp_path):
    log_path = tmp_path / "app.log"
    log_path.write_text("line1\n", encoding="utf-8")
    offsets_path = tmp_path / "offsets.json"

    read_new_lines(log_path, LogOffsetStore(offsets_path))

    with log_path.open("a", encoding="utf-8") as fh:
        fh.write("line2\n")

    fresh_offsets = LogOffsetStore(offsets_path)  # simulates agent restart
    lines = read_new_lines(log_path, fresh_offsets)
    assert [l.text for l in lines] == ["line2"]


def test_detects_truncation_and_restarts_from_zero(tmp_path):
    log_path = tmp_path / "app.log"
    log_path.write_text("a" * 100 + "\n", encoding="utf-8")
    offsets = LogOffsetStore(tmp_path / "offsets.json")
    read_new_lines(log_path, offsets)

    log_path.write_text("short\n", encoding="utf-8")  # simulates rotation/truncation
    lines = read_new_lines(log_path, offsets)
    assert [l.text for l in lines] == ["short"]


def test_missing_file_returns_empty(tmp_path):
    offsets = LogOffsetStore(tmp_path / "offsets.json")
    assert read_new_lines(tmp_path / "missing.log", offsets) == []


def test_line_cap_stops_at_max_lines(tmp_path):
    log_path = tmp_path / "app.log"
    offsets = LogOffsetStore(tmp_path / "offsets.json")
    log_path.write_text("", encoding="utf-8")
    read_new_lines(log_path, offsets)  # establish baseline (first-sight skip)

    with log_path.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(f"line{i}" for i in range(10)) + "\n")
    lines = read_new_lines(log_path, offsets, max_lines=3)
    assert len(lines) == 3


def test_secrets_redacted_before_returning():
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "app.log"
        offsets = LogOffsetStore(Path(d) / "offsets.json")
        path.write_text("", encoding="utf-8")
        read_new_lines(path, offsets)  # establish baseline (first-sight skip)

        with path.open("a", encoding="utf-8") as fh:
            fh.write("API_KEY=supersecretvalue123\n")
        lines = read_new_lines(path, offsets)
        assert "supersecretvalue123" not in lines[0].text
        assert "[REDACTED]" in lines[0].text


def test_dedupe_key_ignores_digits_so_similar_lines_collapse():
    k1 = dedupe_key("run_24x7.log", "Timeout after 30021ms waiting for selector")
    k2 = dedupe_key("run_24x7.log", "Timeout after 51ms waiting for selector")
    assert k1 == k2
