# Hostinger deployment

Target: **Hostinger Cloud Startup**, Node.js app connected to GitHub, MySQL
add-on. No Docker needed for the main path.

## 1. Connect GitHub

In hPanel: Websites → your Cloud Startup plan → **Node.js App** (or
Website → Node.js, depending on Hostinger's current UI naming) → connect
to GitHub → repository `NahimMora/ops-monitor-app` → branch `main`.

## 2. Build & start commands

- Install: `npm ci`
- Build: `npm run build` (runs `next build`; `prisma generate` should be
  added as a `postinstall` step if Hostinger doesn't run it automatically —
  see note below)
- Start: `npm run start` (`next start`)
- Node version: 22

> Prisma's client is generated from `prisma/schema.prisma` and must exist
> before `next build` runs. `package.json` already runs this via a
> `postinstall` hook (`prisma generate`), so a plain `npm ci && npm run
> build` is enough — no extra Hostinger build-step configuration needed.

## 3. MySQL

Create a MySQL database from hPanel → Databases. Hostinger prefixes both
the username and the database name with your account id (e.g. a logical
user `monitor_user` becomes `u123456789_monitor_user`, and a logical
database `monitor` becomes `u123456789_monitor`) — use the **full
prefixed names shown in hPanel**, not the logical names you originally
typed. Note host, port, full username, password, full database name.
Build the connection string:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE
```

If the password contains any of `@ : / ? # % & +`, percent-encode it
first: `node -e "console.log(encodeURIComponent(process.argv[1]))" "the-password"`.

Once `DATABASE_URL` is set (locally, or by pulling it into a shell with
access to the deployed environment), verify it before doing anything else:

```bash
npm run db:check
```

This prints host/port/username/database (password only as `configured`,
never the value) and attempts `SELECT 1`, with a safe, specific diagnosis
on failure — see docs/TROUBLESHOOTING.md "Database connectivity" for what
each failure mode means.

## 4. Environment variables

Set every variable listed in `.env.example` in Hostinger's Node.js app
environment panel — see the root README and `.env.example` for what each
one is. At minimum for a working deploy: `DATABASE_URL`, `APP_URL`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `AGENT_SECRETS`,
`CRON_SECRET`. Generate `ADMIN_PASSWORD_HASH` with `npm run admin:hash --
"your-password"` (see docs/SECURITY.md) — never hand-craft it. `GEMINI_API_KEY` and `VAPID_*` are optional — those
features degrade to "not configured" (HTTP 501 from the AI endpoints,
notifications silently skipped) without them, they don't break the rest
of the app.

## 5. Migrations + seed

After the first successful deploy (so `DATABASE_URL` is reachable), run
once from a shell with access to the same `DATABASE_URL` (Hostinger's SSH
access to the app, or a local machine pointed at the same DB):

```bash
npx prisma migrate deploy
npm run db:seed
```

`db:seed` is idempotent — safe to re-run.

## 6. Verify

```
curl https://ops.moraapps.com/api/health
```

Expect `{"status":"ok", ...}`. This checks a live DB round-trip and
nothing else — no secrets in the response.

## 7. Domain

See [CLOUDFLARE_DOMAIN.md](CLOUDFLARE_DOMAIN.md).

## 8. Cron jobs (Hostinger Cron)

Add four cron jobs from hPanel → Advanced → Cron Jobs, each a `curl`
POST with the `X-Cron-Secret` header set to the `CRON_SECRET` env var:

| Job | Schedule | Command |
|---|---|---|
| Machine health check | every 5 minutes | `curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" https://ops.moraapps.com/api/cron/machine-health-check` |
| Alert evaluation | every 5 minutes | `curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" https://ops.moraapps.com/api/cron/evaluate-alerts` |
| Daily AI brief | 18:00 America/Argentina/Salta | `curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" https://ops.moraapps.com/api/cron/daily-ai-brief` |
| Retention cleanup | daily, e.g. 04:00 | `curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" https://ops.moraapps.com/api/cron/retention` |

Alert evaluation is deterministic (see `src/server/alerts.ts`) — no AI,
no external calls, safe to run at the same 5-minute cadence as the
health check.

**Timezone note:** if Hostinger's cron scheduler runs in UTC (common),
schedule the daily brief job at **21:00 UTC**, which is 18:00
America/Argentina/Salta (fixed UTC-3, no DST) — do not schedule it at
"18:00" in Hostinger's panel unless you've confirmed the panel is already
Salta-local. The endpoint itself computes the exact [18:00, 18:00) window
in Salta time regardless of exactly when the cron fires (`src/lib/timezone.ts`
`dailyBriefWindow()`), and is idempotent per window (`AiBrief` has a
unique `(windowStart, windowEnd)` constraint) — a cron that fires a few
minutes early/late, or twice, will not produce two briefs.

## Rollback

Hostinger's Node.js app panel keeps previous deployments — redeploy the
prior commit from there. Database migrations are additive-by-default in
this schema (no destructive migration has been written); if one is ever
needed, write and test the down-migration before applying it in
production.
