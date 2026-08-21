/**
 * Defense-in-depth redaction pass applied again server-side, right
 * before anything is sent to Gemini (PROMPT §28/§45). The agent already
 * redacts before sending — this is a second pass, not the only one.
 */

import "server-only";

const SENSITIVE_KEY_WORDS = [
  "apikey",
  "token",
  "password",
  "passwd",
  "secret",
  "authorization",
  "cookie",
  "session",
  "bearer",
  "accesskey",
  "privatekey",
];

const ASSIGNMENT_PATTERN = /([A-Za-z][A-Za-z0-9_.-]*)\s*[:=]\s*("?)([^\s"',;]+)(\2)/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.=]+/gi;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_.-]/g, "");
  return SENSITIVE_KEY_WORDS.some((w) => normalized.includes(w));
}

export function redact(text: string): string {
  if (!text) return text;
  let out = text.replace(ASSIGNMENT_PATTERN, (match, key) => (isSensitiveKey(key) ? `${key}=[REDACTED]` : match));
  out = out.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  return out;
}
