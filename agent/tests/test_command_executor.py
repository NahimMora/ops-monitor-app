from monitor_agent.adapters.base import CommandResult, CommandType
from monitor_agent.commands.executor import CommandRequest, execute
from monitor_agent.state import ProcessedCommandStore


class FakeAdapter:
    def __init__(self, supported):
        self._supported = supported
        self.calls = []

    def supported_commands(self):
        return self._supported

    def execute_command(self, command_type, params):
        self.calls.append((command_type, params))
        return CommandResult(ok=True, result={"executed": command_type.value})


def test_rejects_unsupported_command(tmp_path):
    adapter = FakeAdapter(supported=[CommandType.START])
    processed = ProcessedCommandStore(tmp_path / "processed.json")
    request = CommandRequest(id="c1", project_slug="holasalta-manager", type="RESTART")

    result = execute(request, {"holasalta-manager": adapter}, processed)

    assert result.ok is False
    assert "does not support" in result.error
    assert adapter.calls == []


def test_rejects_unknown_project(tmp_path):
    processed = ProcessedCommandStore(tmp_path / "processed.json")
    request = CommandRequest(id="c2", project_slug="ghost-project", type="START")
    result = execute(request, {}, processed)
    assert result.ok is False
    assert "unknown project" in result.error


def test_rejects_invalid_command_type(tmp_path):
    adapter = FakeAdapter(supported=[CommandType.START])
    processed = ProcessedCommandStore(tmp_path / "processed.json")
    request = CommandRequest(id="c3", project_slug="lvr", type="DROP_TABLES")
    result = execute(request, {"lvr": adapter}, processed)
    assert result.ok is False
    assert "unknown command type" in result.error


def test_executes_supported_command_and_marks_processed(tmp_path):
    adapter = FakeAdapter(supported=[CommandType.START])
    processed = ProcessedCommandStore(tmp_path / "processed.json")
    request = CommandRequest(id="c4", project_slug="lvr", type="START")

    result = execute(request, {"lvr": adapter}, processed)

    assert result.ok is True
    assert adapter.calls == [(CommandType.START, {})]
    assert processed.has("c4")


def test_idempotent_replay_does_not_execute_twice(tmp_path):
    adapter = FakeAdapter(supported=[CommandType.START])
    processed = ProcessedCommandStore(tmp_path / "processed.json")
    request = CommandRequest(id="c5", project_slug="lvr", type="START")

    execute(request, {"lvr": adapter}, processed)
    result_again = execute(request, {"lvr": adapter}, processed)

    assert result_again.ok is True
    assert "already processed" in result_again.result.get("note", "")
    assert len(adapter.calls) == 1  # not called a second time
