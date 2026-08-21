import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "@/server/auth-service";
import type { SessionPayload } from "@/lib/session-token";

/** Reads and verifies the session cookie. Returns null if absent/invalid/expired.
 * Safe to call from Server Components, Route Handlers, and Server Actions. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token);
}
