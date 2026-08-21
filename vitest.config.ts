import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // See src/test/server-only-stub.ts for why.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**"],
    env: {
      // Dummy values so importing modules that read process.env at the
      // top level (e.g. Prisma client construction) never throws during
      // unit tests. Nothing here is a real credential.
      DATABASE_URL: "mysql://test:test@localhost:3306/ops_monitor_test",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD_HASH: "scrypt:16384:00:00",
      SESSION_SECRET: "test-session-secret",
      AGENT_SECRETS: "test-agent:test-agent-secret",
      CRON_SECRET: "test-cron-secret",
    },
  },
});
