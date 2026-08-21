<#
.SYNOPSIS
  Stops and unregisters the Ops Monitor Windows Agent scheduled task.
  Does NOT touch any of the monitored projects, their own Task Scheduler
  tasks, or the pre-existing HolaSalta Ops (ops-web-app) task/agent.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-agent.ps1
#>

param(
    [string]$TaskName = "Ops Monitor Agent"
)

$ErrorActionPreference = "Stop"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Task '$TaskName' not found — nothing to do."
    exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false

Write-Host "Unregistered scheduled task '$TaskName'."
Write-Host "Note: agent/state (offsets, offline buffer, identity) was left on disk in case you reinstall. Delete agent\state manually if you want a clean slate."
