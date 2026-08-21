/**
 * Safe DATABASE_URL parsing — extracted so both scripts/db-check.ts and
 * its unit tests can use it without duplicating the logic. Never returns
 * or logs the password itself, only whether one is present.
 */

export interface ParsedDatabaseUrl {
  host: string;
  port: string;
  username: string;
  database: string;
  passwordConfigured: boolean;
  passwordLooksUnencoded: boolean;
}

export function parseDatabaseUrl(raw: string): ParsedDatabaseUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL. Expected format: mysql://USER:PASSWORD@HOST:PORT/DATABASE");
  }

  if (url.protocol !== "mysql:") {
    throw new Error(`DATABASE_URL must use the mysql:// scheme, got "${url.protocol}"`);
  }

  const database = url.pathname.replace(/^\//, "");
  const passwordLooksUnencoded = /[@/?#]/.test(decodeURIComponent(url.password || ""));

  return {
    host: url.hostname,
    port: url.port || "3306",
    username: decodeURIComponent(url.username),
    database,
    passwordConfigured: url.password.length > 0,
    passwordLooksUnencoded,
  };
}
