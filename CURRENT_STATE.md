# Current State — audit (2026-08-21)

Read before OPS_V2_PLAN.md. This is what actually exists today, not what
the docs claim — verified by reading the code.

## Verdict

This is **not** a naive "is it alive" monitor. It's already a small,
well-built ops console with several of the hard invariants the target
spec asks for already correct: deterministic status (`src/server/status.ts`
never lets Gemini touch health), a real adapter architecture
(`agent/monitor_agent/adapters/*` + `ProjectAdapter` protocol, capability
via `supportsCommands` JSON + `supported_commands()`, not `if
project === X`), HMAC-signed outbound-only agent auth with replay
protection, double command whitelist, two-pass secret redaction, incident
fingerprint-grouping, and an offline buffer on the agent that survives
multi-hour outages (with a fixed flush-storm bug documented in
`main.py`'s comments). The gap to the target spec is real but narrower
than "start over" — it's mostly a missing top layer (log
exploration, alerting, charts, incident actions) on a sound base.

## Architecture as built

```
FERNANDO (Windows)                          Hostinger
  monitor_agent (Python, 4 threads)  --HTTPS-->  Next.js App Router
    heartbeat ~12s                                 /api/agent/* (HMAC)
    telemetry ~20s (scheduler+sessions+runs+logs)   /api/cron/*  (secret)
    commands poll ~4s                               /api/ai/*   (session)
    machine health ~20s                             UI (session cookie)
  offline buffer (JSONL, bounded)                  MySQL via Prisma
```

Three real adapters exist and are documented against the actual target
systems (`docs/PROJECT_INTEGRATIONS.md`): HolaSalta Manager (read-only,
continuous service, no runs), LVR AutoPublicador (full command set minus
`RUN_NOW`), HolaSalta AutoPublicador (same). `RUN_NOW` exists in the
`AgentCommandType` enum and DB whitelist machinery but **no adapter
implements it** — correctly left out per the prompt's own §RUN_NOW
caution.

## Data model as built

`prisma/schema.prisma`: `AdminUser`, `Machine`, `MachineHealthSnapshot`,
`Project`, `ProjectHealthSnapshot`, `Run`/`RunStage` (generic, adapter-fed),
`Incident`/`IncidentOccurrence` (fingerprint-deduped, already has
`acknowledgedAt`/`resolvedAt`/`recoveredAt` columns), `LogEvent`
(level/source/message/dedupeKey/optional runId), `DailyMetric`
(long-lived rollup), `AiBrief`/`AiAnalysis` (cached, idempotent),
`AgentCommand` (full lifecycle timestamps), `AuditEvent`,
`PushSubscription`/`NotificationEvent` (typed, cooldown-deduped),
`SessionHealth`, `SchedulerState`.

No `Alert`/`AlertRule`, `Dependency`, `Deployment`, or `Trace` models
exist. `IncidentStatus` is `ACTIVE/ACKNOWLEDGED/RESOLVED` — the columns
for ack/resolve exist but **nothing in the app ever writes them** (no
API route, no button — confirmed by grep and by reading every page).

## UI as built

Pages: Overview (`/`), Runs list + detail, Incidents (list only, anchor
links, no detail route), Project detail, Machine, AI brief list,
Settings (notifications + audit log). Nav: Overview / Runs / Incidents /
AI / Machine / Settings, sidebar desktop + bottom-nav mobile, 6 items.

Design tokens in `globals.css`: `surface-0..3`, `border-subtle/strong`,
`text-primary/secondary/tertiary`, `accent*`, `status-*` (healthy,
running, degraded, critical, offline) each with a `-bg` pair. No
`severity-*` tokens (spec wants these separate from `status-*`), no
`action-primary/danger` tokens — buttons use ad hoc classes per
component. `StatusRail`/`StatusDot`/`StatusBadge` in `status.tsx` are the
one shared status vocabulary and are used consistently.

`recharts` is an installed dependency. **Nothing imports it.** Zero
charts anywhere in the app despite `MachineHealthSnapshot` and
`DailyMetric` holding real time-series data.

## Confirmed gaps vs. the target spec

P0-relevant (spec §72):
- **No Log Explorer.** `LogEvent` rows exist and are ingested
  (`/api/agent/events/batch`) but there is no page to browse/filter them.
  `run.logEvents` only surfaces on the Run detail page, last 30 rows, no
  filters.
- **Run↔Log correlation is broken in practice.** `LogEvent.runId` exists
  in the schema but `/api/agent/events/batch` never sets it — the agent
  doesn't tell the server which run a tailed log line belongs to, so
  `run.logEvents` on every Run detail page is always empty in production
  today (schema promise, not a working feature).
- **No time-series UI.** `recharts` unused; Machine and Project pages
  show only the latest snapshot / daily counts, no trend.
- **No alert engine.** Web Push exists with typed, cooldown-deduped
  events (`notifications.ts`), but there's no configurable rule
  (threshold + duration + severity), no `Alert` lifecycle
  (OK/PENDING/FIRING/ACK/SILENCED/RESOLVED). Today's "alerts" are three
  hardcoded triggers (`machine_offline`/`recovered`, incident-critical —
  actually not even wired: grep shows `INCIDENT_CRITICAL` is a defined
  `NotificationEventType` but nothing calls `queueNotification` with it).
- **No manual incident acknowledge/resolve.** Confirmed: no route under
  `/api/incidents/*`, no button anywhere. `docs/RUNBOOK.md` says this
  outright ("an admin resolve action isn't built as a button yet").
- **Command UX has no lifecycle visibility.** `CommandControls` posts and
  shows a static "queued" message; it never polls the command back to
  SUCCEEDED/FAILED, so the admin cannot tell if a Restart actually
  finished from the UI without navigating away and back.

P1-relevant, confirmed absent: `Dependency` model/UI, unified Timeline,
`Deployment` tracking, distinct business-health funnel view (today
`DailyMetric.itemsSuccess`/`itemsTotal` exist but nothing visualizes a
funnel), 7d/30d charts (no charts at all yet), persistent rate limiting
(explicitly in-memory by design, documented trade-off), secret rotation
tooling (`scripts/rotate-*` don't exist, `docs/SECURITY.md` admits it),
real E2E (`e2e/` has exactly one spec, `login.spec.ts`).

P2, confirmed absent and reasonably deferred: service map, SLO/error
budget, anomaly detection, maintenance windows, command palette,
multi-admin groundwork.

## Things to explicitly preserve (do not regress)

- `deriveProjectStatus` / `isMachineOnline` as the only source of health
  truth — any new UI (alerts, dependencies) must read these, never
  invent its own status logic.
- The adapter/capability pattern (`supportsCommands` JSON,
  `supported_commands()`) — new commands or capabilities must not
  introduce `if (project === "...")` branching.
- Double redaction (agent `sanitizer.py` + server `sanitize.ts`) on
  anything that reaches Gemini.
- Offline buffer + flush-storm cooldown in `main.py` — do not touch
  without re-reading the comment explaining the bug it fixes.
- Incident fingerprinting (`normalizeErrorMessage`/`computeFingerprint`)
  — already unit-tested (`incidents.test.ts`), keep it as the grouping
  mechanism; alerts are a new, separate layer, not a replacement.
- 30-day retention + `DailyMetric` rollup-before-delete ordering in
  `retention.ts`.

## Test/tooling state

Vitest unit tests exist for: password, session-token, timezone,
database-url, db-error, agent-auth, rate-limit, status, incidents (8
files). Playwright: `login.spec.ts` only. Python: pytest covers both live
adapters, the log tailer, sanitizer, scheduler collector, command
executor, config, agent flush behavior, Task Scheduler invocation (9
files) — the Python side is actually better covered than the TS side.
`npm run lint`, `typecheck`, `build` are wired but not run as part of
this audit (see OPS_V2_PLAN.md Phase 4).
