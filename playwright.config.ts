import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Tests that require a live MySQL database (login,
 * dashboard, incidents, commands) are marked accordingly in
 * e2e/README.md — this environment has no MySQL instance available, so
 * only DB-independent smoke tests run here. See docs/TROUBLESHOOTING.md.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      DATABASE_URL: "mysql://test:test@localhost:3306/ops_monitor_e2e",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD_HASH: "scrypt:16384:00:00",
      SESSION_SECRET: "e2e-session-secret",
      AGENT_SECRETS: "e2e-agent:e2e-agent-secret",
      CRON_SECRET: "e2e-cron-secret",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
