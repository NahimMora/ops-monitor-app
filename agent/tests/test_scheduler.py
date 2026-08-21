from monitor_agent.collectors.scheduler import _task_result_to_string


def test_task_result_zero_is_success():
    assert _task_result_to_string(0) == "success"


def test_task_result_still_running():
    assert _task_result_to_string(267009) == "running"


def test_task_result_never_run():
    assert _task_result_to_string(267011) == "never_run"


def test_task_result_unknown_error_code_formatted_as_hex():
    assert _task_result_to_string(2147946720) == "error_0x800710e0"


def test_task_result_none_passthrough():
    assert _task_result_to_string(None) is None
