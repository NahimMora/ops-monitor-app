import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/session-token";
import { env } from "@/lib/env";

export const SESSION_COOKIE_NAME = "ops_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid_credentials" | "locked" };

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.adminUser.findUnique({ where: { email } });

  // Constant-shape response whether or not the user exists, to avoid
  // leaking account existence via timing/response differences.
  if (!user) {
    verifyPassword(password, "scrypt:16384:00:00");
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, reason: "locked" };
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
    await prisma.auditEvent.create({
      data: { action: "login_failed", targetType: "AdminUser", targetId: user.id, metadata: { attempts } },
    });
    return { ok: false, reason: attempts >= MAX_FAILED_ATTEMPTS ? "locked" : "invalid_credentials" };
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  await prisma.auditEvent.create({ data: { action: "login_succeeded", targetType: "AdminUser", targetId: user.id } });

  const now = Math.floor(Date.now() / 1000);
  const token = createSessionToken({ sub: user.email, iat: now, exp: now + SESSION_TTL_SECONDS }, env.sessionSecret);
  return { ok: true, token };
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  return verifySessionToken(token, env.sessionSecret);
}

/** True when the session is valid but past 50% of its TTL — the caller
 * should reissue a fresh cookie so an active admin never gets logged out
 * mid-session, without extending inactive sessions forever. */
export function shouldRenew(payload: SessionPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  return remaining < SESSION_TTL_SECONDS / 2;
}

export function issueSessionToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createSessionToken({ sub: email, iat: now, exp: now + SESSION_TTL_SECONDS }, env.sessionSecret);
}
