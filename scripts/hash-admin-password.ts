/**
 * Official way to generate ADMIN_PASSWORD_HASH. Reuses the exact same
 * hashPassword() the app verifies against at login (src/lib/password.ts)
 * — no duplicated hashing logic here.
 *
 * Usage:
 *   npm run admin:hash -- "MI_PASSWORD"
 *
 * Prints only the resulting hash — never echoes the password back.
 */

import { hashPassword } from "../src/lib/password";

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run admin:hash -- "MI_PASSWORD"');
  process.exit(1);
}

console.log(hashPassword(password));
