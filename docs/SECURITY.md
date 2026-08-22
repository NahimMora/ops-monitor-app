# Security

## Auth

Single admin account (`AdminUser`, one row). Password hashed with Node's
built-in `scrypt` (`src/lib/password.ts`, N=16384, 64-byte key,
timing-safe compare) — no plaintext password is ever stored or logged.
Session is a signed cookie (`src/lib/session-token.ts`:
`base64url(payload).base64url(hmac_sha256(payload, SESSION_SECRET))`),
`httpOnly`, `secure` in production, `sameSite=lax`, 7-day expiry.

Login is rate-limited (10 attempts/minute per IP,
`src/server/rate-limit.ts`) and the account locks for 15 minutes after 5
consecutive failed attempts (`src/server/auth-service.ts`). A
nonexistent-account login still runs a dummy `verifyPassword` call to
avoid a timing signal revealing account existence.

Every route under `(protected)` requires a valid session
(`src/app/(protected)/layout.tsx` → `getSession()`, redirects to
`/login`). Every mutating API route not meant for the agent or cron also
checks `getSession()` explicitly (`/api/commands`, `/api/ai/*`,
`/api/push/*`, `/api/incidents/[id]/{acknowledge,resolve}`,
`/api/alerts/[id]/{acknowledge,silence}`) and writes an `AuditEvent` on
success.

## Agent authentication

Separate from admin auth entirely. Each request from the Windows Agent is
HMAC-SHA256 signed (`agent/monitor_agent/api_client.py` /
`src/server/agent-auth.ts`) over `method\npath\ntimestamp\n` + the exact
raw request body, keyed by a per-agent secret (`AGENT_SECRETS` env var,
`agentId:secret` pairs — never a single shared secret). Requests with a
timestamp more than 5 minutes off from server time are rejected (basic
replay protection). Signature comparison is timing-safe
(`crypto.timingSafeEqual`).

## Command whitelist

There is no arbitrary-command execution path anywhere in this system.
`AgentCommandType` is a fixed enum (`START / STOP / RESTART / RUN_NOW /
PAUSE_SCHEDULE / RESUME_SCHEDULE`). The web app only lets an admin queue
a command whose type is in that project's own `Project.supportsCommands`
whitelist (`/api/commands`, checked server-side, not just hidden in the
UI). The agent only executes a command if the target adapter's
`supported_commands()` includes it (`agent/monitor_agent/commands/executor.py`)
— two independent whitelist checks, cloud and agent side. Every command
is audited (`AuditEvent`) on request and on result.

## Secret redaction

Applied twice: once on the agent before anything leaves the machine
(`agent/monitor_agent/sanitizer.py`, log lines and any Gemini-bound
snippet), and again server-side right before building a Gemini payload
(`src/server/sanitize.ts`, defense in depth). Both redact by matching
compound key names (e.g. `WHATSAPP_SESSION_TOKEN`, not just exact
`TOKEN=`) against a keyword list (`api key, token, password, secret,
authorization, cookie, session, bearer, access key, private key`), plus
`Authorization: Bearer ...` headers specifically. Never logs full `.env`
contents, cookies, or Playwright/Selenium session data — sessions are
reported as a status enum only (`authenticated / expired / challenge /
browser_error / unknown`), never as session material itself.

## What's NOT in this repo

No SSH keys, no cloud credentials, no `.env` files, no real
`ADMIN_PASSWORD_HASH`/`SESSION_SECRET`/`AGENT_SECRETS`/`GEMINI_API_KEY`/
`VAPID_*` values — only `.env.example` with empty placeholders. `agent/.env`
and `agent/config.json` are gitignored.

## Reporting / rotating

If a secret is ever suspected exposed:

- `SESSION_SECRET` — rotate in Hostinger env vars; this invalidates every
  active session (single admin, low blast radius).
- `AGENT_SECRETS` / agent's `OPS_AGENT_SECRET` — rotate both sides
  together (`scripts/rotate-*` equivalents are not yet built for this repo;
  today this means editing the env var and `agent/.env` directly and
  restarting the agent task).
- `GEMINI_API_KEY` — rotate in Google AI Studio and update the env var.
- `ADMIN_PASSWORD_HASH` — generate a new hash with `npm run admin:hash --
  "new-password"` and update the env var + re-seed.

## Generating the admin password hash

```bash
npm run admin:hash -- "your-password"
```

`scripts/hash-admin-password.ts` is a thin CLI wrapper around the exact
same `hashPassword()` (`src/lib/password.ts`, scrypt) the login route
verifies against — there is no separate/duplicated hashing
implementation. It prints only the resulting hash, never the password.
