<#
.SYNOPSIS
  One-shot diagnostic for the Ops Monitor Windows Agent: checks Python
  venv, actually LOADS the agent's configuration (not just "file exists"),
  scheduled task state (including crash-on-start detection), and project
  paths.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\agent-doctor.ps1
#>

param(
    [string]$TaskName = "Ops Monitor Agent"
)

$ErrorActionPreference = "Continue"
$AgentDir = Resolve-Path "$PSScriptRoot\..\agent"
$ok = $true

function Check($label, [ScriptBlock]$test) {
    try {
        $result = & $test
        if ($result) {
            Write-Host "[OK]   $label"
        } else {
            Write-Host "[FAIL] $label"
            $script:ok = $false
        }
    } catch {
        Write-Host "[FAIL] $label -- $($_.Exception.Message)"
        $script:ok = $false
    }
}

Write-Host "--- Ops Monitor Agent doctor ---"

$PythonExe = "$AgentDir\.venv\Scripts\python.exe"

Check "Python venv exists" { Test-Path $PythonExe }
Check "config.json exists" { Test-Path "$AgentDir\config.json" }
Check "agent\.env exists (secrets)" { Test-Path "$AgentDir\.env" }

Check "monitor_agent package importable" {
    if (-not (Test-Path $PythonExe)) { return $false }
    # monitor_agent is a local package (not pip-installed), so it's only
    # importable when Python's CWD is agent/ (implicit sys.path entry) --
    # matches how Task Scheduler actually runs it (WorkingDirectory =
    # agent/), and is why this Push-Location matters, not just style.
    Push-Location $AgentDir
    try {
        $out = & $PythonExe -c "import monitor_agent; print('ok')" 2>&1
    } finally {
        Pop-Location
    }
    $out -match "ok"
}

# Actually loads the config the same way the agent itself does (default
# resolution, real .env loading, real state-dir resolution) instead of
# just checking that files exist on disk — a config.json with a typo, a
# missing secret, or an unknown adapter key would pass the old checks but
# fail here, which is the point.
Write-Host ""
Write-Host "--- Config load (agent/monitor_agent/config.py: load_config()) ---"

if (-not (Test-Path $PythonExe)) {
    Write-Host "[FAIL] Cannot run config check -- Python venv missing"
    $ok = $false
} else {
    $checkScript = @'
import json
import sys

try:
    from monitor_agent.config import load_config
    from monitor_agent.adapters.registry import build_adapter
except Exception as exc:
    print(json.dumps({"ok": False, "stage": "import", "error": str(exc)}))
    sys.exit(0)

try:
    config = load_config()
except Exception as exc:
    print(json.dumps({"ok": False, "stage": "load_config", "error": str(exc)}))
    sys.exit(0)

project_results = []
adapters_built = 0
for p in config.projects:
    exists = __import__("os").path.isdir(p.root_path)
    entry = {"slug": p.slug, "root_path": p.root_path, "exists": exists}
    try:
        build_adapter(p.adapter, p.root_path, p.options)
        adapters_built += 1
        entry["adapter_ok"] = True
    except Exception as exc:
        entry["adapter_ok"] = False
        entry["adapter_error"] = str(exc)
    project_results.append(entry)

print(json.dumps({
    "ok": True,
    "agent_id_present": bool(config.agent_id),
    "cloud_url_present": bool(config.cloud_base_url),
    # Never the secret value itself -- only whether one is set.
    "secret_status": "configured" if config.agent_secret else "missing",
    "state_dir": str(config.state_dir),
    "state_dir_exists": config.state_dir.is_dir(),
    "project_count": len(config.projects),
    "adapters_built": adapters_built,
    "projects": project_results,
}))
'@
    # Written to a temp .py file rather than passed inline via `-c`:
    # PowerShell 5.1 does not reliably preserve embedded double quotes
    # when marshalling a string argument to a native executable, which
    # silently corrupted this script's JSON literals when passed inline.
    $tempScriptPath = Join-Path $env:TEMP "ops-monitor-agent-doctor-check.py"
    Set-Content -Path $tempScriptPath -Value $checkScript -Encoding utf8

    # Run as a `python -` invocation (script piped via stdin), not
    # `python tempfile.py`: the latter prepends the temp file's own
    # directory to sys.path instead of the CWD, which breaks importing
    # monitor_agent (a local, non-installed package resolved via CWD --
    # the same reason Task Scheduler's WorkingDirectory matters at all).
    Push-Location $AgentDir
    try {
        $rawOutput = Get-Content -Raw -Path $tempScriptPath | & $PythonExe - 2>&1
    } finally {
        Pop-Location
        Remove-Item -Path $tempScriptPath -Force -ErrorAction SilentlyContinue
    }
    $resultLine = ($rawOutput | Select-Object -Last 1)

    try {
        $result = $resultLine | ConvertFrom-Json
    } catch {
        Write-Host "[FAIL] Config check produced unparsable output:"
        Write-Host "       $rawOutput"
        $result = $null
        $ok = $false
    }

    if ($result) {
        if (-not $result.ok) {
            Write-Host "[FAIL] Config load failed at stage '$($result.stage)': $($result.error)"
            $ok = $false
        } else {
            Check "  Agent ID present" { $result.agent_id_present }
            Check "  Cloud URL present" { $result.cloud_url_present }
            Check "  Agent secret configured" { $result.secret_status -eq "configured" }
            Check "  State dir resolved and exists ($($result.state_dir))" { $result.state_dir_exists }
            Check "  At least one project configured" { $result.project_count -gt 0 }
            Check "  All $($result.project_count) adapters constructed without error" { $result.adapters_built -eq $result.project_count }

            foreach ($p in $result.projects) {
                Check "  Project '$($p.slug)' root_path exists ($($p.root_path))" { $p.exists }
                if (-not $p.adapter_ok) {
                    Write-Host "         adapter error: $($p.adapter_error)"
                }
            }
        }
    }
}

Write-Host ""
Write-Host "--- Scheduled task ---"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Check "Scheduled task '$TaskName' registered" { $null -ne $task }

if ($task) {
    $info = $task | Get-ScheduledTaskInfo
    $neverRun = ($null -eq $info.LastRunTime) -or ($info.LastRunTime.Year -lt 2000)

    if ($task.State -eq "Running") {
        Write-Host "[OK]   Scheduled task '$TaskName' is currently running"
    } elseif ($neverRun) {
        Write-Host "[WARN] Scheduled task '$TaskName' has never run yet (State: $($task.State))"
    } elseif ($info.LastTaskResult -ne 0) {
        # State is not Running, but it HAS run before and the last result
        # is non-zero -- i.e. it started and then exited/crashed, which
        # RestartCount will retry, but this is worth surfacing explicitly
        # rather than reporting a generic "not running".
        Write-Host "[FAIL] Scheduled task '$TaskName' is not running and its last result was non-zero (0x$('{0:x8}' -f $info.LastTaskResult)) -- it likely started and exited immediately. Check the config load results above and Windows Event Viewer (Task Scheduler operational log) for details."
        $ok = $false
    } else {
        Write-Host "[WARN] Scheduled task '$TaskName' is registered but not currently running (State: $($task.State), LastTaskResult: 0)"
    }
}

Write-Host ""
Write-Host "--- Result ---"
if ($ok) {
    Write-Host "All checks passed." -ForegroundColor Green
} else {
    Write-Host "One or more checks failed -- see above." -ForegroundColor Yellow
}
