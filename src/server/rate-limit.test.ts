import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetRateLimitsForTests } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimitsForTests());

  it("allows requests under the limit", () => {
    const r1 = checkRateLimit("k1", { maxAttempts: 3, windowSeconds: 60 });
    const r2 = checkRateLimit("k1", { maxAttempts: 3, windowSeconds: 60 });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("blocks once the limit is exceeded within the window", () => {
    checkRateLimit("k2", { maxAttempts: 2, windowSeconds: 60 });
    checkRateLimit("k2", { maxAttempts: 2, windowSeconds: 60 });
    const third = checkRateLimit("k2", { maxAttempts: 2, windowSeconds: 60 });
    expect(third.allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("a", { maxAttempts: 1, windowSeconds: 60 });
    const otherKey = checkRateLimit("b", { maxAttempts: 1, windowSeconds: 60 });
    expect(otherKey.allowed).toBe(true);
  });
});
