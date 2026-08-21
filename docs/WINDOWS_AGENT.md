# Windows Monitor Agent

Runs on `FERNANDO` (the same machine as `WebApp_HolaSalta`, `LVR`, and
`Scrapping_HolaSalta`), started by Task Scheduler at logon and restarted
automatically on crash.

## Install

```powershell
cd C:\Monitor\agent
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy config.example.json config.json
```

Create `agent\.env` (never committed — see `.gitignore`):

```env
OPS_AGENT_ID=fernando-agent
OPS_AGENT_SECRET=<same value as AGENT_SECRETS in the web app's .env, for this agent id>
OPS_CLOUD_URL=https://ops.moraapps.com
```

Then, from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\agent-doctor.ps1
```

This registers a Task Scheduler task named **"Ops Monitor Agent"** —
deliberately distinct from the machine's other tasks (`HolaSalta Ops
Local Agent`, `HolaSalta-24x7`, `LaVozRiojana-24x7`,
`LaVozRiojana-ManualUI`), all of which this system leaves alone (see
`docs/PROJECT_INTEGRATIONS.md` §0).

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-agent.ps1
```

Only removes the "Ops Monitor Agent" task. `agent\state\` (offsets,
offline buffer, processed command ids) is left on disk in case you
reinstall; delete it manually for a clean slate.

## What it does, each loop independently (`agent/monitor_agent/main.py`)

| Loop | Interval | Sends |
|---|---|---|
| Heartbeat | ~12s | `agent_id`, `hostname`, per-project health |
| Telemetry | ~20s | Machine vitals, or per-project scheduler/session state, plus any new log lines |
| Commands poll | ~4s | (nothing — polls `GET /api/agent/commands`, executes, posts result) |
| Machine health | ~20s | CPU/RAM/disk/uptime/Chrome process snapshot |

A dead network never blocks a monitored project: every send goes through
`Agent.send_or_buffer()`, which appends to a bounded local JSONL buffer
(`agent/state/offline_buffer.jsonl`, capped at `max_offline_buffer_events`,
oldest dropped first) on failure and replays it before the next send once
connectivity returns.

## Restart without losing state

Everything that must survive a restart is in `agent/state/` as plain
JSON/JSONL, written atomically (`state.py`'s `_atomic_write_json`):

- `log_offsets.json` — per-file byte offset + rotation fingerprint, so a
  restarted agent resumes tailing exactly where it left off and detects
  truncation/rotation instead of re-sending or skipping lines.
- `processed_commands.json` — bounded LRU of executed command ids, so a
  retried `GET /commands` response never re-executes a command.
- `offline_buffer.jsonl` — undelivered events, replayed on next success.

## Diagnostics

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\agent-doctor.ps1
```

Checks: venv present, `config.json`/`agent\.env` present, the package
imports cleanly, every configured project's `root_path` still exists, the
scheduled task is registered and running, and that `agent\state` exists
(i.e. the agent has run at least once).

## Tests

```powershell
cd agent
.\.venv\Scripts\python.exe -m pytest -q
```

42 tests covering: secret redaction, log offset persistence/rotation
detection, the offline buffer's bounded-drop behavior, Task Scheduler
result-code parsing, command whitelist enforcement + idempotent replay,
and both stateful adapters' status-derivation logic against real fixture
shapes captured from the live machine.

## Adding a fourth project

1. Add a `ProjectAdapter` implementation under `agent/monitor_agent/adapters/`.
2. Register it in `agent/monitor_agent/adapters/registry.py`.
3. Add its entry to `config.json`'s `projects` array.
4. Add the project row via `prisma/seed.ts` (or the DB directly) with the
   matching `slug` and `adapterKey`.

Nothing in `main.py`, `commands/executor.py`, or the collectors needs to
change.
