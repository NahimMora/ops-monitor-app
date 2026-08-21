/**
 * Safe DATABASE_URL diagnostic. Never prints the password or the full
 * connection string — only host/port/username/database (and whether a
 * password is present at all), then attempts `SELECT 1` and reports a
 * human-readable, safe result.
 *
 * Usage:
 *   npm run db:check
 */

import { PrismaClient } from "@prisma/client";
import { isDatabaseUnavailableError } from "../src/server/db-error";
import { parseDatabaseUrl } from "../src/server/database-url";

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("[db:check] DATABASE_URL is not set in the environment.");
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = parseDatabaseUrl(raw);
  } catch (err) {
    console.error(`[db:check] ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  console.log("[db:check] Parsed DATABASE_URL (password never shown):");
  console.log(`  host:     ${parsed.host}`);
  console.log(`  port:     ${parsed.port}`);
  console.log(`  username: ${parsed.username}`);
  console.log(`  database: ${parsed.database}`);
  console.log(`  password: ${parsed.passwordConfigured ? "configured" : "MISSING"}`);
  if (parsed.passwordLooksUnencoded) {
    console.log(
      "  [WARN] the password segment may contain characters (@ / ? #) that need percent-encoding " +
        "in a URL — if this looks wrong, re-encode it with: node -e \"console.log(encodeURIComponent(process.argv[1]))\" \"<password>\""
    );
  }

  if (!parsed.host || !parsed.username || !parsed.database) {
    console.error("[db:check] host, username, or database is empty — DATABASE_URL looks incomplete.");
    process.exitCode = 1;
    return;
  }

  console.log("\n[db:check] Attempting SELECT 1 ...");
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[db:check] OK — connected and authenticated successfully.");
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      const code = (err as { code?: string }).code;
      const isAuthIssue = code === "P1000" || code === "P1010";
      console.error(
        `[db:check] FAILED — database unreachable or authentication rejected` +
          (code ? ` (Prisma error ${code})` : "") +
          `.\n` +
          `  This means the ${isAuthIssue ? "username/password was rejected" : "connection itself failed (host/port/network)"}.\n` +
          `  Verify in hPanel: the exact username and database name (Hostinger prefixes both with your account id,\n` +
          `  e.g. "monitor_user" -> "u123456789_monitor_user"), and that the password segment of DATABASE_URL exactly\n` +
          `  matches — byte for byte, no trailing whitespace — the MySQL user's password, percent-encoded if it\n` +
          `  contains any of: @ : / ? # % & +`
      );
    } else {
      console.error(`[db:check] FAILED — unexpected error: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
