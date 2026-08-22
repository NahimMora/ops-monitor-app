# Ops Platform v2 — plan

Companion to `CURRENT_STATE.md`. Scope is this session's P0 slice of the
full prompt (§72's own P0 list), implemented for real — not a redesign.
P1/P2 items get schema/architecture notes where cheap, and an explicit
"not built" marker otherwise, per the prompt's Definition of Done (§93):
no dead UI, no fake data.

## What this session builds (P0)

1. **Run↔log correlation** — fix the broken `LogEvent.runId` link so
   "view logs for this run" is a real feature, not a schema promise.
2. **Log Explorer** (`/logs`) — filter by project, level, source, runId,
   free text, time range. Card list, not a table (mobile-first).
3. **Time series** — `recharts` wired for real: Machine CPU/RAM/Disk
   (1h/6h/24h/7d from `MachineHealthSnapshot`) and Project success-rate
   trend (30d from `DailyMetric`).
4. **Alert engine** — new `AlertRule`/`Alert` models, a deterministic
   evaluator (no AI), three built-in rules, a new cron endpoint, an
   Alerts page with Acknowledge/Silence.
5. **Incident actions** — Acknowledge/Resolve wired end to end
   (route, audit event, UI), plus a real Incident detail page
   (`/incidents/[id]`) since the prompt calls this out explicitly (§17)
   and today there's only a list.
6. **Command lifecycle UX** — `CommandControls` polls the command it just
   queued through to a terminal state instead of showing a static
   "queued" toast.
7. **Nav restructure** — add Logs + Alerts without blowing past a sane
   mobile tab count; move AI/Settings behind a "More" sheet on mobile,
   keep everything in the desktop sidebar.

Explicitly **not** built this session (documented, not faked):
`Dependency` model/UI, `Deployment` tracking, unified Timeline,
persistent (DB-backed) rate limiting, secret-rotation scripts, extra E2E
coverage beyond what the new flows need for smoke-level confidence,
SLO/error-budget, service map, anomaly detection, command palette. Each
gets a one-line "why deferred + where it would hook in" note below.

## Data model changes

```prisma
// New, additive only — no destructive migration.

enum AlertSeverity { INFO WARNING CRITICAL }
enum AlertStatus   { OK PENDING FIRING ACKNOWLEDGED SILENCED RESOLVED }

model AlertRule {
  id             String   @id @default(cuid())
  key            String   @unique   // "machine_disk_low", "project_no_recent_success", ...
  name           String
  description    String
  severity       AlertSeverity
  enabled        Boolean  @default(true)
  scope          String   // "machine" | "project"
  projectSlug    String?  // null for machine-scoped rules
  config         Json     // { thresholdPercent?, thresholdMinutes?, forMinutes, ... }
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  alerts         Alert[]
}

model Alert {
  id             String       @id @default(cuid())
  ruleId         String
  rule           AlertRule    @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  projectSlug    String?
  status         AlertStatus  @default(PENDING)
  severity       AlertSeverity
  title          String
  message        String       @db.Text
  value          Json?        // last observed metric snapshot, for the UI/AI context
  firstFiredAt   DateTime
  lastEvaluatedAt DateTime
  firingAt       DateTime?
  acknowledgedAt DateTime?
  silencedUntil  DateTime?
  resolvedAt     DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([ruleId, projectSlug])
  @@index([status])
}
```

`NotificationEventType` gains `ALERT_FIRING` / `ALERT_RESOLVED`.

`LogEvent` — no column change needed; `runId` already exists, it just
needs to actually get set (see below). Considered adding
`traceId`/`component` columns per the prompt's structured-log shape, but
nothing in this repo can populate them today — `traceId` would have to
originate inside the three *separate* pipeline repos (`C:\LVR`,
`C:\HolaSalta\...`), which are out of scope here, and `component` is
already well served by the existing `source` field (log filename/module,
e.g. `ig_client.log`). Adding empty columns nothing writes would violate
§68/§69 (no fake data / no dead UI wiring). Left as a documented P1: if
those pipelines are ever changed to emit a run-scoped correlation id
themselves, thread it through `RunRecordSchema.metadata` →
`LogEventSchema` the same way `run_external_id` is added now.

## Run↔log correlation (the actual P0 fix)

`agent/monitor_agent/main.py`'s `telemetry_loop` already fetches
`adapter.get_runs()` in the same cycle it tails logs. Today that list is
used only to POST `/api/agent/runs` — it's thrown away for log purposes.
Fix: pick the "current" run from that list (prefer one with
`status == "running"`, else the most recently started one) and attach its
`external_run_id` to every log event collected that cycle as
`run_external_id` (new optional field on `LogEventSchema`). Server-side,
`/api/agent/events/batch` resolves `(projectId, run_external_id)` →
`Run.id` (the same unique constraint `RunsPayloadSchema` already relies
on) and sets `LogEvent.runId`, and — currently missing entirely —
passes that `runId` into `recordIncidentOccurrence`, so
`Incident.affectedRunCount` starts being accurate instead of always 0.

This is best-effort (a log line tailed mid-cycle could technically belong
to the *previous* run if one just finished), which is stated in the code
comment rather than presented as exact.

## Alert engine design

Deterministic, not AI — consistent with §15/§60. `src/server/alerts.ts`
exports pure `evaluateRule(rule, input) => { breach: boolean; value:
unknown; message: string }` functions per rule `key`, unit-tested without
a DB, plus an orchestrator `evaluateAllAlerts()` that:

1. Loads enabled `AlertRule` rows.
2. For project-scoped rules, runs once per project; for machine-scoped,
   once per machine.
3. Computes breach via the rule's pure evaluator against fresh DB reads
   (recent `Run`s for success-rate/staleness rules, latest
   `MachineHealthSnapshot` for disk).
4. State machine per `(ruleId, projectSlug)` upserted row:
   - no row + breach → create `PENDING`, `firstFiredAt = now`.
   - `PENDING` + breach held ≥ `config.forMinutes` → `FIRING`, send
     `ALERT_FIRING` push (cooldown handled by existing
     `notifications.ts` dedupe bucket).
   - `FIRING`/`ACKNOWLEDGED`/`SILENCED` + still breaching → stay (update
     `lastEvaluatedAt`/`value`); if `SILENCED` and `silencedUntil` has
     passed, drop back to `FIRING`.
   - any non-`OK`/`RESOLVED` status + no breach → `RESOLVED`,
     `resolvedAt = now`, send `ALERT_RESOLVED`.
   - `RESOLVED`/`OK` + no breach → no-op (row stays as history; a later
     breach re-opens the *same* row, mirroring how `Incident` reuses its
     fingerprint row instead of multiplying rows).

Built-in rules seeded (idempotent upsert in `prisma/seed.ts`, matching
the existing seed style):

- `machine_disk_low` (machine-scoped): `disk_free_mb < config.thresholdMb`
  (default 5000), `forMinutes: 10`.
- `project_no_recent_success` (per project with `supportsCommands`
  non-empty, i.e. the two pipeline projects — HolaSalta Manager has no
  discrete runs so this rule doesn't apply to it, matching §2's "don't
  model runs where none exist"): `minutesSinceLastSuccess >
  config.thresholdMinutes` (default 90 — wide enough to not false-positive
  across normal scheduling gaps, tunable), `forMinutes: 0` (already a
  duration by construction).
- `project_success_rate_low` (per pipeline project): rolling
  success rate over the last `config.windowMinutes` (default 60) `<
  config.thresholdPercent` (default 60), only evaluated once at least
  `config.minSamples` (default 3) runs exist in the window (avoids
  noisy 0%/100% on tiny samples), `forMinutes: 10`.

New cron: `POST /api/cron/evaluate-alerts`, same `X-Cron-Secret` pattern
as the existing three, documented for Hostinger Cron at every 5 minutes
(bundled conceptually with the health-check cadence).

## Pages/components

- `src/app/(protected)/logs/page.tsx` — server component, filters via
  `searchParams` (`project`, `level`, `source`, `runId`, `q`, `range`),
  Prisma query capped at 200 rows, stacked cards (project · level ·
  timestamp · source, expandable message), empty/error states per §55.
  A client `LiveToggle` wraps the existing `AutoRefresh` so polling can be
  paused (§8 "pause streaming").
- `src/app/(protected)/alerts/page.tsx` — grouped by status (FIRING first,
  dominant per §33; then PENDING/ACKNOWLEDGED/SILENCED; RESOLVED
  collapsed/last). `AlertActions` client component: Acknowledge (no
  confirm), Silence (small duration picker: 30m/1h/4h), matching §31's
  "confirmation matches risk" — neither is destructive, so no modal.
- `src/app/(protected)/incidents/[id]/page.tsx` — detail page: header,
  occurrences timeline (from `IncidentOccurrence`, already timestamped),
  affected runs (via `IncidentOccurrence.runId`, now populated),
  `IncidentActions` (Acknowledge / Resolve — Resolve gets a lightweight
  confirm since it stops the auto-recover clock early), existing
  `AnalyzeButton` reused.
- `src/components/charts/*` — thin `recharts` wrappers
  (`AreaMetricChart`, `SuccessRateChart`), client components, each
  handling its own empty/loading state (no data yet vs. genuinely zero
  runs are different messages).
- Machine/Project pages gain a window switcher (`Link`-based
  `searchParams`, consistent with the existing `Runs` page filter-chip
  pattern — no new client state needed) and one chart section each.
- `command-controls.tsx` — after POST, poll `GET /api/commands?project=`
  every 2s (max ~30 polls, i.e. 60s, matching the 5-minute command TTL
  loosely but not blocking the UI forever) for the returned `command_id`,
  render a small step list (Requested → Picked up → Running → terminal)
  instead of a static toast.
- `app-shell.tsx` — bottom nav becomes Overview / Runs / Incidents / Logs
  / Machine (5, unchanged pattern) + a 6th "More" tab opening
  `MoreSheet` (Alerts / AI / Settings / Sign out). Desktop sidebar lists
  all seven items flat (no overflow needed at that width).

## Migration safety

Single additive migration (`AlertRule`, `Alert`, two enums, two
`NotificationEventType` values). No column drops, no renames, no data
backfill required (alerts start empty; `LogEvent.runId` starts being
populated going forward, historical rows stay `null`, which the Log
Explorer and Run detail page both already treat as "no linked run" —
existing UI, not new).

## Phases (this session)

1. ~~Audit~~ → `CURRENT_STATE.md`.
2. ~~This plan~~.
3. Implement: schema + migration → agent run-correlation fix → alert
   engine + cron → incident actions + detail page → log explorer →
   charts → command lifecycle UX → nav.
4. `lint` / `typecheck` / `test` / `build` / `pytest`, fix real failures.
5. Manual pass at 360/390/430/768/desktop widths on the new/changed
   pages for overflow, hierarchy, empty/loading/error states.
6. Update `README.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`,
   `docs/HOSTINGER_DEPLOYMENT.md` (new cron row), `docs/SECURITY.md` if
   new session-authed routes need a mention.

P1 items from the full prompt (Dependencies, Deployments, Timeline,
business-health funnel, persistent rate limiting, secret rotation
tooling, broader E2E) are intentionally left for a follow-up pass — each
has an obvious seam to extend into given the models/pages built here
(e.g. `Alert.projectSlug` + a future `Dependency.affectedProjectSlugs`
JSON field would slot into the same Alerts page; a `Deployment` model
would join the same way `SchedulerState` does today).
