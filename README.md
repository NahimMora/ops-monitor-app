# Ops Monitor

Private operations console for a single administrator, watching three
production news-publishing pipelines running on one Windows machine
(`FERNANDO`). Deployed at `https://ops.moraapps.com`.

Answers, from a phone, in order: **is everything working? → what broke? →
since when? → how bad? → probable cause? → what can I do about it?**

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design,
[docs/PROJECT_INTEGRATIONS.md](docs/PROJECT_INTEGRATIONS.md) for exactly
how each monitored project is instrumented, and
[docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) /
[docs/WINDOWS_AGENT.md](docs/WINDOWS_AGENT.md) to actually stand this up.

## What this is NOT

It is not, and must never become, a dependency the three monitored
pipelines need to keep running. If Ops Monitor is fully down, HolaSalta
Manager, LVR AutoPublicador, and HolaSalta AutoPublicador keep publishing
exactly as before — observability fails open (see §59 of the original
spec, reflected in `agent/monitor_agent/state.py`'s offline buffer).

It also does not replace `C:\HolaSalta\Ops` (`ops-web-app`,
`ops.holasalta.com`) — that's a separate, already-live control panel for
HolaSalta specifically. Ops Monitor coexists with it and is read-only
toward HolaSalta Manager; see docs/PROJECT_INTEGRATIONS.md §0.

## Repo layout

```
src/            Next.js App Router web app (TypeScript, Tailwind, Prisma)
prisma/         Database schema, seed script
agent/          Windows Monitor Agent (Python) — runs on FERNANDO
scripts/        Agent install/uninstall/doctor PowerShell scripts
e2e/            Playwright end-to-end tests
docs/           Architecture, deployment, security, runbook docs
```

## Local development (web app)

Requires Node 22 and a MySQL instance (local, Docker, or a Hostinger dev DB).

```bash
npm ci
cp .env.example .env   # fill in DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET, AGENT_SECRETS, CRON_SECRET
npx prisma migrate dev
npm run db:seed
npm run dev
```

Generate an admin password hash (reuses the app's own `hashPassword()`,
never prints the password back):

```bash
npm run admin:hash -- "your-password"
```

Quality gates (all must pass before pushing to `main`):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Windows Monitor Agent

Runs on `FERNANDO`, the same machine as the three monitored projects. See
[docs/WINDOWS_AGENT.md](docs/WINDOWS_AGENT.md) for the full setup;
short version:

```powershell
cd agent
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy config.example.json config.json   # edit if project paths ever change
# create agent/.env with OPS_AGENT_ID / OPS_AGENT_SECRET / OPS_CLOUD_URL
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\install-agent.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\agent-doctor.ps1
```

Agent tests:

```powershell
cd agent
.\.venv\Scripts\python.exe -m pytest -q
```

## Deployment

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) and
[docs/CLOUDFLARE_DOMAIN.md](docs/CLOUDFLARE_DOMAIN.md).
