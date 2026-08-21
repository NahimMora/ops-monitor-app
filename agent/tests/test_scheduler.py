from monitor_agent.collectors.scheduler import _normalize_dotnet_date, _task_result_to_string


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


def test_normalize_dotnet_date_parses_legacy_wcf_format():
    # Real output observed from Get-ScheduledTaskInfo | ConvertTo-Json on
    # this machine's Windows PowerShell 5.1 -- NOT an ISO string, as
    # originally (wrongly) assumed. A buffered telemetry payload
    # containing this exact raw value was rejected by the cloud because
    # `new Date("/Date(1787283944000)/ ")` doesn't parse.
    result = _normalize_dotnet_date("/Date(1787283944000)/")
    assert result == "2026-08-21T03:45:44+00:00"


def test_normalize_dotnet_date_passes_through_a_real_iso_string():
    # Defensive: if a future PowerShell/config change ever does emit ISO
    # directly, don't mangle it.
    assert _normalize_dotnet_date("2026-08-21T09:45:44.000Z") == "2026-08-21T09:45:44.000Z"


def test_normalize_dotnet_date_none_and_empty():
    assert _normalize_dotnet_date(None) is None
    assert _normalize_dotnet_date("") is None
