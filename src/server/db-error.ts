/**
 * Detects "the database itself is unreachable/misconfigured" errors so
 * routes can respond with a clean, safe 503 instead of either leaking a
 * raw Prisma stack trace (which can include connection details) or
 * silently pretending the request succeeded.
 *
 * Prisma error codes used here (see
 * https://www.prisma.io/docs/orm/reference/error-reference):
 *   P1000 - Authentication failed against the database server
 *   P1001 - Can't reach database server
 *   P1002 - The database server was reached but timed out
 *   P1008 - Operations timed out
 *   P1009 - Database already exists (not a connectivity issue, excluded)
 *   P1010 - User was denied access
 *   P1011 - Error opening a TLS connection
 *   P1017 - Server has closed the connection
 */

// No `server-only` import here: this module is pure error-classification
// logic (no secrets, no DB client) and is also used by scripts/db-check.ts,
// a plain Node CLI script run via `tsx` outside Next's bundler — where
// `server-only`'s module-resolution trick doesn't apply and would throw.

const DB_UNAVAILABLE_PRISMA_CODES = new Set(["P1000", "P1001", "P1002", "P1008", "P1010", "P1011", "P1017"]);

export function isDatabaseUnavailableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && DB_UNAVAILABLE_PRISMA_CODES.has(code)) return true;

  // PrismaClientInitializationError (connection refused, DNS failure,
  // etc.) doesn't always carry a `code` — its constructor name does.
  const name = (err as { name?: unknown }).name;
  if (name === "PrismaClientInitializationError" || name === "PrismaClientRustPanicError") return true;

  return false;
}

/** Safe body for API routes — never includes the underlying error
 * message (which, for auth failures, can echo back the attempted
 * username/host). */
export const DATABASE_UNAVAILABLE_BODY = { status: "error", database: "unavailable" } as const;
export const DATABASE_UNAVAILABLE_STATUS = 503;
