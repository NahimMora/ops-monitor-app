# AI analysis (Gemini)

## Provider

One central adapter: `src/server/gemini.ts`. Nothing else in the codebase
calls the Gemini API directly or hardcodes the model name — everything
goes through `generateStructured()`, which reads `GEMINI_API_KEY` and
`GEMINI_MODEL` from `src/lib/env.ts`. Change the model in one place
(the env var) if needed.

If `GEMINI_API_KEY` is unset, every AI endpoint returns HTTP 501 with a
clear message rather than crashing — the rest of the app (monitoring,
commands, incidents) works fully without it.

## Daily brief

`POST /api/cron/daily-ai-brief`, called by Hostinger Cron at 18:00
America/Argentina/Salta (see HOSTINGER_DEPLOYMENT.md for the UTC
compensation). Window: `[yesterday 18:00, today 18:00)` Salta-local,
computed in `src/lib/timezone.ts` `dailyBriefWindow()` and always stored
as UTC. Idempotent: `AiBrief` has a unique `(windowStart, windowEnd)`
constraint — calling the endpoint twice for the same window returns the
existing brief unless `?force=true` is passed for an explicit manual
regeneration.

### What gets sent to Gemini

Never raw logs. `src/server/ai-payload.ts` builds a compact JSON payload:
per-project run/item/channel counts for the window, and per-incident
summaries (title, severity, occurrence count, affected run count,
first/last seen, up to 3 redacted sample messages) plus which incidents
recovered in the window. Incidents are already fingerprint-grouped
(`src/server/incidents.ts`) before this point, so "37 identical WhatsApp
timeouts" arrives as one entry with a count, not 37 log lines.

### Response shape

Structured JSON via Gemini's `responseSchema` (not free text parsing):
`overall_status`, `executive_summary`, `important_incidents`,
`recurring_patterns`, `probable_causes`, `recommended_actions`,
`healthy_components`, `risks`, `confidence` — see
`src/server/ai-brief.ts`. The system prompt is in Spanish and explicitly
asks for specific, evidence-based writing ("31 of 37 errors were the same
WhatsApp timeout between 14:02–15:17") over vague hand-waving.

## On-demand analysis

Two buttons, two endpoints, both session-protected and both cached:

- `POST /api/ai/analyze-incident/[id]` → `src/server/ai-analysis.ts`
  `analyzeIncident()`
- `POST /api/ai/analyze-run/[id]` → `analyzeRun()`

Each result is cached in `AiAnalysis` keyed by `cacheKey`
(`incident:<id>` / `run:<id>`) — a second click without `?force=true`
returns the cached result instead of calling Gemini again. Response
shape: `probable_cause`, `evidence`, `what_to_check`, `impact`,
`recommended_manual_steps`, `confidence`. The prompt explicitly forbids
Gemini from recommending it execute anything itself — only manual steps
for the admin.

## What Gemini never does

Decide whether the machine is online, whether a heartbeat is stale,
whether a process is running, or whether to run a command. All of that is
deterministic (`src/server/status.ts`, the agent's adapters) and computed
before Gemini is ever called — see `docs/ARCHITECTURE.md` "Status is
deterministic, AI is not monitoring".
