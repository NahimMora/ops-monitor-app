# Runbook

## "MACHINE OFFLINE" is showing

The agent hasn't sent a heartbeat in 45+ seconds (`MACHINE_OFFLINE_THRESHOLD_SECONDS`,
`src/server/status.ts`) or the periodic cron check
(`/api/cron/machine-health-check`, every ~5 min) confirmed it. This is
detected two ways on purpose — the heartbeat route updates status live,
and the cron catches the case where the agent (or the whole machine)
died and can obviously no longer report its own death.

1. Check the machine is actually powered on / not asleep.
2. RDP/Quick Assist in and check the "Ops Monitor Agent" scheduled task:
   `Get-ScheduledTask -TaskName "Ops Monitor Agent" | Get-ScheduledTaskInfo`
3. Run `scripts\agent-doctor.ps1` for a full diagnostic.
4. Check `agent\state\agent.stderr.log`-equivalent — the agent logs to
   stdout with Python's `logging`; if run under Task Scheduler, redirect
   or check Windows Event Viewer / the task's last run result.
5. If the agent process is fine but the machine has no internet, nothing
   is lost — telemetry buffers locally (`agent\state\offline_buffer.jsonl`)
   and flushes once connectivity returns.

**This never affects the three monitored pipelines.** They keep running
whether or not the agent or the cloud app are reachable.

## A project shows STUCK

Machine is online, but the project's own heartbeat/state file hasn't
advanced past its stale threshold (LVR: 900s from `data/supervisor_heartbeat.json`;
HolaSalta AutoPublicador: 900s from `data/runtime_24x7_state.json`; see
PROJECT_INTEGRATIONS.md). This usually means a stage hung (browser wedged,
network call never timing out) rather than a clean crash.

1. Open the project page for the exact reason string.
2. Click "Analizar con IA" on the most recent run for a probable cause,
   if `GEMINI_API_KEY` is configured.
3. Manual fix depends on the project — for LVR/HolaSalta AutoPublicador,
   the `RESTART` command (if you're comfortable with it) stops and
   restarts the supervisor process; for HolaSalta Manager, this system is
   read-only — use the existing `ops-web-app` panel
   (`ops.holasalta.com`) for that project's controls instead.

## A command stays "pending" / "picked_up" forever

Commands expire after 5 minutes (`COMMAND_TTL_SECONDS`,
`src/app/api/commands/route.ts`) and the commands-GET route
opportunistically marks expired ones. If it's stuck in `PICKED_UP`, the
agent claimed it but its result POST never arrived — check the agent's
connectivity and its `agent\state\processed_commands.json` (idempotency
guard) doesn't already show the id as processed with a result that failed
to reach the cloud (offline buffer would hold it until reconnect).

## An incident won't stop being "active"

Incidents auto-recover (`status → RESOLVED`) once no new occurrence
arrives for 30 minutes (`autoRecoverStaleIncidents`, run from the same
5-minute machine-health cron). If it's still active and the underlying
problem is actually fixed, it will flip within that window on its own —
no manual action needed. To force it immediately, use the **Resolve**
button on the incident's detail page (`/incidents/[id]`) or the list —
this calls `POST /api/incidents/[id]/resolve`, audited as
`incident_resolved`. If a fresh occurrence arrives afterward, the
incident automatically un-resolves back to `ACTIVE`
(`recordIncidentOccurrence` in `src/server/incidents.ts`), so resolving
early is always safe.

## An alert is firing and I want it to stop paging me

- **Acknowledge** (`/alerts`) — stops nothing, just marks it seen; the
  alert stays `FIRING`-equivalent for evaluation purposes but you won't
  get confused about whether you've noticed it.
- **Silence** (30m/1h/4h) — suppresses re-notification until the window
  passes, after which it reverts to `FIRING` if the underlying condition
  is still breaching (`src/server/alerts.ts` upsertAlertState). Silencing
  does not change the underlying system — if the disk is actually still
  filling up, it will still be full when the silence expires.
- Alerts auto-resolve the moment their rule stops breaching on the next
  5-minute evaluation (`/api/cron/evaluate-alerts`) — no manual resolve
  action for alerts (unlike incidents), since "the metric recovered" is
  itself an objective, checkable fact the evaluator already computes.

## A run's "Log excerpt" / Log Explorer `runId` filter is empty

`LogEvent.runId` is a best-effort correlation, not exact (see
docs/ARCHITECTURE.md "Run↔log correlation") — the agent tags each log
line with whatever run looked current at the time it was tailed. A line
tailed right at a run boundary can land on the wrong run, and log rows
ingested before this feature existed have `runId = null` permanently (no
backfill). If it's empty for a *recent* run and machine/agent are online,
check the project actually has discrete runs (HolaSalta Manager doesn't
— it's a continuous service, see docs/PROJECT_INTEGRATIONS.md §A) before
assuming something's broken.

## Daily AI brief didn't show up

1. Confirm `GEMINI_API_KEY` is set — without it the cron endpoint returns
   501, not a brief.
2. Confirm the Hostinger cron job actually fired at the right UTC time
   (see HOSTINGER_DEPLOYMENT.md's timezone note) — check Hostinger's cron
   job history/logs.
3. Manually trigger it: `curl -X POST -H "X-Cron-Secret: $CRON_SECRET"
   https://ops.moraapps.com/api/cron/daily-ai-brief?force=true`

## Retention / data missing after 30 days

Expected behavior — raw logs, machine/project health snapshots, session
health rows, and Run/RunStage rows older than 30 days are deleted daily
(`src/server/retention.ts`). `DailyMetric` rollups are computed for any
day about to lose its source Run rows before deletion, so historical
success-rate trends still work; per-run/per-log detail does not survive
past 30 days by design (PROMPT §25).
