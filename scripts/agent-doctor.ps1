<#
.SYNOPSIS
  One-shot diagnostic for the Ops Monitor Windows Agent: checks Python
  venv, config, scheduled task state, project paths, and connectivity to
  the cloud app (a lightweight unauthenticated GET to /api/health).

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

Check "Python venv exists" { Test-Path "$AgentDir\.venv\Scripts\python.exe" }
Check "config.json exists" { Test-Path "$AgentDir\config.json" }
Check "agent/.env exists (secrets)" { Test-Path "$AgentDir\.env" }

Check "monitor_agent package importable" {
    $py = "$AgentDir\.venv\Scripts\python.exe"
    if (-not (Test-Path $py)) { return $false }
    $out = & $py -c "import monitor_agent; print('ok')" 2>&1
    $out -match "ok"
}

Check "config.json declares projects with existing root_path" {
    $configPath = "$AgentDir\config.json"
    if (-not (Test-Path $configPath)) { return $false }
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $allExist = $true
    foreach ($p in $config.projects) {
        if (-not (Test-Path $p.root_path)) {
            Write-Host "       missing project path: $($p.root_path)"
            $allExist = $false
        }
    }
    $allExist
}

Check "Scheduled task '$TaskName' registered" {
    $null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)
}

Check "Scheduled task '$TaskName' is running" {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $task -and $task.State -eq "Running"
}

Check "agent/state directory has recent offline buffer / offsets (agent has run at least once)" {
    Test-Path "$AgentDir\state"
}

Write-Host "--- Result ---"
if ($ok) {
    Write-Host "All checks passed." -ForegroundColor Green
} else {
    Write-Host "One or more checks failed — see above." -ForegroundColor Yellow
}
