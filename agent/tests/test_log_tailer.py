from pathlib import Path

from monitor_agent.collectors.log_tailer import dedupe_key, read_new_lines
from monitor_agent.state import LogOffsetStore


def test_reads_only_new_lines_since_last_offset(tmp_path):
    log_path = tmp_path / "app.log"
    log_path.write_text("line1\nline2\n", encoding="utf-8")
    offsets = LogOffsetStore(tmp_path / "offsets.json")

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
    log_path.write_text("\n".join(f"line{i}" for i in range(10)) + "\n", encoding="utf-8")
    offsets = LogOffsetStore(tmp_path / "offsets.json")
    lines = read_new_lines(log_path, offsets, max_lines=3)
    assert len(lines) == 3


def test_secrets_redacted_before_returning():
    log_path_content = "API_KEY=supersecretvalue123\n"
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "app.log"
        path.write_text(log_path_content, encoding="utf-8")
        offsets = LogOffsetStore(Path(d) / "offsets.json")
        lines = read_new_lines(path, offsets)
        assert "supersecretvalue123" not in lines[0].text
        assert "[REDACTED]" in lines[0].text


def test_dedupe_key_ignores_digits_so_similar_lines_collapse():
    k1 = dedupe_key("run_24x7.log", "Timeout after 30021ms waiting for selector")
    k2 = dedupe_key("run_24x7.log", "Timeout after 51ms waiting for selector")
    assert k1 == k2
