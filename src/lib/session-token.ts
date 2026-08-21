/**
 * Minimal signed session token: base64url(payload_json).base64url(hmac).
 * Deliberately not a full JWT implementation (no alg-confusion surface,
 * one fixed algorithm: HMAC-SHA256) — this is a single-admin app, not a
 * federation target.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  sub: string; // admin email
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(data: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(data).digest());
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expectedSignature = sign(body, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}
