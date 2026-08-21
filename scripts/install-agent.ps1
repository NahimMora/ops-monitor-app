<#
.SYNOPSIS
  Installs the Ops Monitor Windows Agent as a Task Scheduler task that
  starts at logon and restarts automatically if it exits.

.DESCRIPTION
  Registers a task named "Ops Monitor Agent" (deliberately distinct from
  the pre-existing "HolaSalta Ops Local Agent" and "HolaSalta-24x7" /
  "LaVozRiojana-24x7" tasks on this machine — this agent is a separate,
  independent system, see docs/PROJECT_INTEGRATIONS.md).

.PARAMETER PythonExe
  Path to the Python interpreter to run the agent with. Defaults to the
  venv created next to this script's parent (agent/.venv).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install-agent.ps1
#>

param(
    [string]$PythonExe = "$PSScriptRoot\..\agent\.venv\Scripts\python.exe",
    [string]$TaskName = "Ops Monitor Agent"
)

$ErrorActionPreference = "Stop"

$AgentDir = Resolve-Path "$PSScriptRoot\..\agent"
$MainModule = "monitor_agent.main"

if (-not (Test-Path $PythonExe)) {
    Write-Error "Python venv not found at $PythonExe. Run: cd agent; py -3.12 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}

if (-not (Test-Path "$AgentDir\config.json")) {
    Write-Warning "agent\config.json not found — copy config.example.json to config.json first."
}
if (-not (Test-Path "$AgentDir\.env")) {
    Write-Warning "agent\.env not found — it must set OPS_AGENT_ID, OPS_AGENT_SECRET, OPS_CLOUD_URL. See .env.example."
}

$Action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "-m $MainModule" `
    -WorkingDirectory $AgentDir

$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Trigger.Delay = "PT30S"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Uses $env:COMPUTERNAME, not $env:USERDOMAIN — a workgroup PC (no AD
# domain) can resolve USERDOMAIN to "WORKGROUP" instead of the machine
# name, which breaks Register-ScheduledTask (this is the same bug the
# ops-web-app project already hit and documented in its own CLAUDE.md).
$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:COMPUTERNAME\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName'. Starting it now..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Format-List LastRunTime, LastTaskResult, NextRunTime

Write-Host "Done. Run scripts\agent-doctor.ps1 to verify the agent is reporting correctly."
