# E2E tests

`login.spec.ts` covers what's reachable **without a live MySQL database**:
the login page rendering, client-side form requirements, the unauthenticated
redirect (the `(protected)` layout's session check runs before any DB
query), and a mobile-viewport smoke check.

This sandbox/dev environment has no MySQL instance available, so the
DB-dependent flows from PROMPT §49 (successful login, dashboard rendering
with real data, project/run/incident detail pages, manual command
confirmation against a mocked agent) are **not exercised here** — they're
written as TODOs below rather than faked. Once `DATABASE_URL` points at a
real (or docker-compose) MySQL instance with migrations + `npm run db:seed`
applied, extend this suite with:

- [ ] Login with the seeded admin credentials succeeds and reaches `/`.
- [ ] Login with wrong credentials shows an error and does not set a cookie.
- [ ] Dashboard renders the three seeded projects with `UNKNOWN` status
      (no agent has reported yet in a fresh seed).
- [ ] A project page renders its (empty) run history without crashing.
- [ ] Requesting a command shows the confirm step, then a "queued" message,
      using a project whose `supportsCommands` is non-empty.
- [ ] Responsive smoke test across the full nav at 390px.

Run locally once a database is available:

```powershell
$env:DATABASE_URL = "mysql://user:pass@localhost:3306/ops_monitor_dev"
npm run prisma:deploy
npm run db:seed
npm run e2e
```
