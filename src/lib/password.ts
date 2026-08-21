/**
 * Password hashing via Node's built-in scrypt — deliberately avoids
 * bcrypt/argon2 native bindings, which are a common source of pain on
 * Windows dev machines and Hostinger's build environment.
 *
 * Stored format: "scrypt:N:salt_hex:hash_hex"
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384; // cost factor
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N });
  return `scrypt:${SCRYPT_N}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (!Number.isFinite(n) || salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length, { N: n });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
