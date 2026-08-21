import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "./session-token";

const SECRET = "test-secret";

describe("session-token", () => {
  it("round-trips a valid token", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSessionToken({ sub: "admin@example.com", iat: now, exp: now + 3600 }, SECRET);
    const payload = verifySessionToken(token, SECRET);
    expect(payload?.sub).toBe("admin@example.com");
  });

  it("rejects a token signed with a different secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSessionToken({ sub: "admin@example.com", iat: now, exp: now + 3600 }, SECRET);
    expect(verifySessionToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSessionToken({ sub: "admin@example.com", iat: now - 100, exp: now - 1 }, SECRET);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSessionToken({ sub: "admin@example.com", iat: now, exp: now + 3600 }, SECRET);
    const [, sig] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ sub: "attacker@example.com", iat: now, exp: now + 3600 })).toString("base64url");
    expect(verifySessionToken(`${tamperedBody}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
  });
});
