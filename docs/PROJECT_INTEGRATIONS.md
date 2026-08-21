# Project Integrations — discovery notes

This document records what the Windows Monitor Agent actually found on
`FERNANDO` (the single production machine, `COMPUTERNAME=FERNANDO`) for each
of the three monitored projects, and exactly which mechanism each adapter
uses. Everything here was verified by reading code/docs and running
read-only checks (`/health`, `Get-ScheduledTask`, file reads) — nothing was
assumed from the project names.

## 0. Pre-existing system: HolaSalta Ops (`ops-web-app`) — NOT part of this project

`C:\HolaSalta\Ops` (repo `NahimMora/ops-web-app`) is a **separate, already
live production system**: a Node/Fastify + React + MySQL control panel at
`ops.holasalta.com`, with its own Windows agent (Task Scheduler task
`"HolaSalta Ops Local Agent"` → `scripts/supervisor.ps1`), that already
does start/stop/restart/publish command dispatch for Project A
(`WebApp_HolaSalta`) and keeps that backend alive via a watchdog.

Decision (confirmed with the admin): **Ops Monitor coexists, does not touch
or depend on it.** Ops Monitor's Windows Agent registers its own,
differently-named Task Scheduler task, and for Project A it only *reads*
(the same `/health` endpoint `ops-web-app` already polls, plus Task
Scheduler state) — it never issues START/STOP/RESTART for Project A. That
stays exclusively owned by `ops-web-app`'s own supervisor to avoid two
independent controllers fighting over the same process.

## A. HolaSalta Ops Backend (`WebApp_HolaSalta`)

- Path: `C:\HolaSalta\WebApp_HolaSalta`. Repo: `HolaSaltaManager`.
- Stack: FastAPI + Uvicorn backend (`backend/main.py`), React/Vite frontend
  (not monitored — UI only). Persistence: JSON files under `backend/data`,
  no DB.
- **Structured health contract (already exists, read-only, safe):**
  `GET http://127.0.0.1:8000/health` →
  ```json
  {
    "status": "running",
    "api": "HolaSalta Manager",
    "watchdog": {"enabled": true, "alive": true, "interval_seconds": 5},
    "platforms": {
      "whatsapp": {"enabled": true, "worker_status": "running", "browser_connected": true, "needs_auth": false, "heartbeat_age_seconds": 0.0},
      "x": {"enabled": true, "worker_status": "running", "browser_connected": true, "needs_auth": false, "heartbeat_age_seconds": 1.0}
    },
    "common_queue_depth": 0
  }
  ```
  `status` values seen/expected: `running`, `stopped`, `needs_auth`,
  `degraded` (per `ops-web-app`'s own `CLAUDE.md`, which already documents
  this contract and a bug they fixed comparing against a stale `"healthy"`
  literal — the Ops Monitor adapter must compare against the real values
  above, not `"healthy"`).
- Publish pipeline: `POST /api/publish/` orchestrates Wix + per-platform
  publishers for `instagram`, `facebook`, `whatsapp`, `x`, `wix`. There is
  no discrete "run" log/history endpoint exposed — Ops Monitor treats
  Project A as a continuous service (health/session/queue-depth), not as
  discrete pipeline runs like B/C, until/unless a structured run log is
  added later.
- Sessions: WhatsApp and X run via a local persistent Playwright runtime
  (see `docs/local_automation_architecture.md` in that repo); `/health`
  already reports `browser_connected` / `needs_auth` per platform — this
  is exactly the read-only session-health signal the Monitor needs, no new
  instrumentation required.
- Task Scheduler: no dedicated task for the FastAPI backend itself — it is
  kept alive by `ops-web-app`'s `supervisor.ps1` (task `"HolaSalta Ops
  Local Agent"`). Ops Monitor surfaces that task's state as read-only
  context but does not manage it.
- **Adapter capabilities:** `get_health()`, `get_sessions()`,
  `get_scheduler_state()` (read-only, reports on the `ops-web-app`
  supervisor task). `supported_commands()` → `[]` (no commands — by design,
  see §0).

## B. LVR AutoPublicador (`C:\LVR`, `news-auto-publisher-lavozriojana`)

- Structured status contract (existing, preferred over any log parsing):
  `python cli.py status --json` (`cli.py:267`), backed live by
  `data/supervisor_heartbeat.json` (schema `version: 2`) — the adapter
  reads this JSON file directly (cheaper than shelling out) since it's the
  same data `status --json` re-derives:
  ```
  { supervisor: {status, pid},
    heartbeat: {status, age_seconds},
    last_cycle,
    stages: [{stage, status, received, selected, processed, succeeded,
               failed, deferred, expired, duration_seconds, error_type,
               error_code, next_retry_at, details, exit_code}, ...],
    queues: {social: {...}, meta: {...}, web: {...}, rewrite: {...}},
    deployment: {commit_sha, release_tag, deployed_at, deployment_mode,
                 configuration_fingerprint, operator, backup_reference},
    exit_code }
  ```
  Global/per-stage status enum: `success`(0) / `no_work`(0) / `degraded`(2)
  / `failed`(1) / `blocked`(3).
- Heartbeat: same file, `heartbeat.status` / `heartbeat.age_seconds` already
  encode freshness — the adapter trusts this instead of recomputing it.
- Stages/channels actually present (from live data, not assumed):
  `scraping_rewrite` (per-source children: locales, policiales, interior,
  deportes, nuevarioja, paparazzi, infobae_policiales — then `rewrite`,
  `select_publish_batch`), `web`, `facebook`, `instagram`,
  `instagram_insights`. **No WhatsApp/X channel exists in LVR.**
- Logs: `C:\LVR\logs\*.log`, ~27 plain-text files, one per module, sizes
  vary widely, no rotation observed — the agent's log adapter must cap
  ingestion and watch for unbounded growth rather than assume rotation.
- Task Scheduler: `LaVozRiojana-24x7` (5-min re-invoke of
  `scripts\start_24x7_production.ps1`, idempotent — the script no-ops via
  `data/.supervisor.pid` if already running) and `LaVozRiojana-ManualUI`
  (`scripts\start_manual_video_ui.ps1`).
- **Whitelisted commands supported:**
  - `START` → `python cli.py start`
  - `STOP` → `python cli.py stop`
  - `RESTART` → composed as `stop` then `start` (no native subcommand)
  - `PAUSE_SCHEDULE` / `RESUME_SCHEDULE` → `Disable-ScheduledTask` /
    `Enable-ScheduledTask` on `LaVozRiojana-24x7` (cli.py has no
    pause/resume; the only real lever is the Task Scheduler task itself)
  - `RUN_NOW` → **not implemented.** `cli.py run-once` exists but can
    publish for real without `--dry-run`; LVR's own `AGENTS.md` warns
    against running it outside authorized windows. Exposing it as a
    generic button would violate rule 6 (no real publishes to test/operate
    the Monitor). Left out of the whitelist for this project.
- Session/browser automation: none in the automated pipeline — Facebook
  and Instagram publish via the Graph API, not a browser session. No
  Playwright/Selenium session-health concept applies here.
- Hard rule carried over from `C:\LVR\AGENTS.md`: never run `run-once` or
  `canary` without `--dry-run`; never touch `data/`, `logs/`, `output/`,
  `FotosLVR/`, `.env`; never start/stop/restart this live instance to
  "test" the Monitor — only mock/unit-test the command wiring.

## C. HolaSalta AutoPublicador (`C:\HolaSalta\Scrapping_HolaSalta`, `news-auto-publisher`)

- Entry point: `run_24x7.py` is the production supervisor loop. It
  orchestrates 6 subprocess stages per cycle: `scrape` (→ `run_all.py`,
  which itself runs `main_PP.py` → optional `main_SG.py` → `main_MS.py` →
  `openIA/rewrite_news.py`), `web` (`pipeline/publish_web.py`),
  `instagram` (`meta/run_ig.py`), `facebook` (`meta/run_fb.py`), `wpp`
  (`meta/run_wpp_x.py`), `x` (`meta/run_x.py`). `MS`/`PP`/`SG` = Municipalidad
  Salta / Prensa Policial / Salta Gobierno source scrapers.
- Structured state (existing): `data/runtime_24x7_state.json`, written by
  `utils/runtime_supervisor.py`:
  ```
  { version, supervisor: {status: idle|running|stopped,
      last_clean_shutdown_at, last_heartbeat, interval_seconds,
      started_at, last_start_mode, current_cycle, current_script,
      last_cycle} }
  ```
  `current_cycle`: `{cycle_id, started_at, status}` (null when idle).
  `last_cycle`: `{cycle_id, finished_at, success_count, total_count,
  results: [{script, label, ok, return_code, started_at, finished_at}],
  status: "ok"|"partial"}`.
- Heartbeat: `supervisor.last_heartbeat` (unix seconds) in the same file,
  updated every `PIPELINE_24X7_HEARTBEAT_SECONDS` (default 30s). Stale
  threshold used internally: `PIPELINE_24X7_STALE_SECONDS` (default 900s)
  — reused as the Monitor's default too. Cycle interval default 3600s.
- Logs: `logs/run_24x7.log` (RotatingFileHandler, 2MB × 5 backups) plus
  ~10 per-component logs (`wordpress_publisher.log`, `ig_client.log`,
  etc.). Per-stage subprocess output is re-logged into `run_24x7.log`
  prefixed `[label]`.
- Task Scheduler: `HolaSalta-24x7` (confirmed live —
  `venv\Scripts\python.exe -u run_24x7.py`, `WorkingDirectory
  C:\HolaSalta\Scrapping_HolaSalta`).
- No CLI/`--json` status contract, no pause/resume, no run-now — control
  is pure process lifecycle. There's built-in crash tolerance: if state
  says `running` but the heartbeat is stale beyond the threshold, the next
  start logs a "recovery" and proceeds; if the heartbeat is still fresh it
  refuses a second instance (duplicate-supervisor guard).
- **Whitelisted commands supported:**
  - `START` → launch `venv\Scripts\python.exe -u run_24x7.py` in the
    project directory (no-op / refused if a fresh heartbeat already shows
    it running — mirrors the project's own guard)
  - `STOP` → terminate the `run_24x7.py` process tree by PID (there is no
    graceful signal other than Ctrl+C in an interactive console — the
    project's own recovery logic already tolerates an ungraceful stop on
    next start, which is the same outcome a manual admin `taskkill` would
    produce today)
  - `RESTART` → `STOP` then `START`
  - `PAUSE_SCHEDULE` / `RESUME_SCHEDULE` → `Disable-ScheduledTask` /
    `Enable-ScheduledTask` on `HolaSalta-24x7`
  - `RUN_NOW` → **not implemented** (no dry-run mode exists here at all;
    triggering a cycle out-of-band would scrape and publish for real)
- Browser automation: **Selenium**, not Playwright — persistent Chrome
  profile dirs (`utils/selenium_chrome.py`). WhatsApp (`meta/run_wpp_x.py`)
  and Instagram (`meta/ig_selenium_uploader.py`) use browser sessions;
  Facebook and X use API clients, not browser sessions. No existing
  read-only session-health entrypoint — the adapter approximates session
  health from the most recent per-platform result in `last_cycle.results`
  plus the age of `*_posted.json` files rather than driving the browser.

## Cross-project summary for the agent's adapter registry

| Project | Status source | Heartbeat | Commands | Sessions |
|---|---|---|---|---|
| A — HolaSalta Manager | `GET 127.0.0.1:8000/health` | `platforms.*.heartbeat_age_seconds` | none (read-only) | WhatsApp/X via `/health.platforms.*` |
| B — LVR | `data/supervisor_heartbeat.json` | `heartbeat.age_seconds` | START/STOP/RESTART/PAUSE/RESUME | none (API-based publishing) |
| C — HolaSalta Scrapping | `data/runtime_24x7_state.json` | `supervisor.last_heartbeat` | START/STOP/RESTART/PAUSE/RESUME | WhatsApp/Instagram via Selenium (approximated) |
