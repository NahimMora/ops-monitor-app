# Architecture

## Two halves

**Cloud control plane** — Next.js App Router app (TypeScript, Tailwind,
Prisma/MySQL), deployed on Hostinger at `https://ops.moraapps.com`. Holds
all state, renders the UI, calls Gemini, sends Web Push. Never initiates
a connection toward the home network.

**Windows Monitor Agent** — small Python process (`agent/monitor_agent`)
running 24/7 on `FERNANDO`, the same machine as the three monitored
projects. It always initiates the connection, over outbound HTTPS, to the
cloud app. No inbound port is ever opened on the machine for this system.

```
┌─────────────────────────────┐        outbound HTTPS only        ┌──────────────────────────────┐
│  FERNANDO (Windows, home)    │  ────────────────────────────▶   │  Hostinger (ops.moraapps.com) │
│                               │                                    │                                │
│  monitor_agent (Python)      │  ◀─── polls for pending commands  │  Next.js (App Router)          │
│   ├─ adapters (3 projects)   │                                    │   ├─ /api/agent/*  (HMAC auth) │
│   ├─ machine/scheduler       │                                    │   ├─ /api/cron/*   (secret)    │
│   │  collectors (psutil,     │                                    │   ├─ /api/ai/*     (session)   │
│   │  Get-ScheduledTask)      │                                    │   └─ UI (session cookie auth)  │
│   ├─ log tailer (incremental)│                                    │                                │
│   ├─ offline buffer (JSONL)  │                                    │  MySQL (Prisma)                │
│   └─ command executor        │                                    │  Gemini (on-demand + daily)    │
│      (fixed whitelist only)  │                                    │  Web Push (VAPID)              │
└─────────────────────────────┘                                    └──────────────────────────────┘
```

## Why not SSH

The three projects and the agent share a machine. SSH would mean opening
inbound access to a home network, or storing a private key in the cloud
app — both rejected outright. The agent-initiates-outbound model gives
the same "the cloud can act on the machine" capability (via polled,
whitelisted commands) with none of that exposure.

## Why polling, not WebSockets

Single admin, "near real-time" (5-10s dashboard feel) is enough — see
`src/components/auto-refresh.tsx`, which just calls `router.refresh()` on
an interval, and the agent's four independent loops
(`agent/monitor_agent/main.py`: heartbeat ~12s, telemetry ~20s, commands
poll ~4s, machine health ~20s). This is deliberately swappable for
SSE/WebSocket later without changing the DB schema or the agent's
adapters — the transport is isolated to `api_client.py` and the
`/api/agent/*` routes.

## Status is deterministic, AI is not monitoring

Every `ProjectStatus` value shown in the UI comes from one of two places:

1. **The project's own adapter** (`agent/monitor_agent/adapters/*.py`) —
   each project already has a structured contract (health endpoint,
   heartbeat file, or supervisor state file — see
   [PROJECT_INTEGRATIONS.md](PROJECT_INTEGRATIONS.md)) and the adapter
   translates that into one of `HEALTHY / RUNNING / IDLE / DEGRADED /
   STUCK / FAILED / STOPPED / UNKNOWN` with a fixed, tested rule set (see
   `agent/tests/test_adapter_*.py`).
2. **The cloud's own reachability judgment** (`src/server/status.ts`) —
   only the cloud can know the agent stopped reporting, so
   `deriveProjectStatus()` overrides the adapter's last-known status with
   `UNREACHABLE` (machine offline) or `UNKNOWN` (telemetry gone stale)
   when appropriate. It never invents `HEALTHY`.

Gemini (`src/server/gemini.ts`) is called only for summarization,
pattern-grouping, and suggesting causes/next steps — see
[AI_ANALYSIS.md](AI_ANALYSIS.md). It never decides machine/project status
and never executes anything.

## Project Adapter Architecture

`agent/monitor_agent/adapters/base.py` defines one `ProjectAdapter`
protocol (`get_health`, `get_runs`, `get_scheduler_state`, `get_sessions`,
`get_log_sources`, `get_current_activity`, `supported_commands`,
`execute_command`). Three concrete adapters
(`holasalta_manager.py`, `lvr.py`, `holasalta_scrapping.py`) implement it
against each project's real, existing contract — nothing in
`main.py`/`commands/executor.py` branches on project identity. Adding a
fourth project means adding one adapter module and one registry entry
(`adapters/registry.py`), nothing else.

## Data model

See `prisma/schema.prisma` for the full, commented schema. Highlights:

- `Machine` / `Project` carry current computed status; `*HealthSnapshot`
  tables are the point-in-time history behind it.
- `Run` / `RunStage` normalize each project's different native shape into
  one contract (see PROJECT_INTEGRATIONS.md for exactly how each adapter
  maps onto it).
- `Incident` / `IncidentOccurrence` group repeated errors by a stable
  fingerprint (`src/server/incidents.ts`) instead of one row per log line.
- `DailyMetric` is the long-lived aggregate that survives the 30-day raw
  data retention cleanup (`src/server/retention.ts`).
- `AgentCommand` is the only path from "admin clicks a button" to
  "something runs on FERNANDO" — always whitelisted, always audited.

## What's deliberately not here

No Kafka, no Elasticsearch, no Kubernetes, no Redis. Single Node process
+ MySQL + a small Python agent is enough for one admin watching three
pipelines. The in-process rate limiter (`src/server/rate-limit.ts`) resets
on deploy, which is an accepted trade-off at this scale.
