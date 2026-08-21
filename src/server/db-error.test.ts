import { describe, it, expect } from "vitest";
import { isDatabaseUnavailableError } from "./db-error";

describe("isDatabaseUnavailableError", () => {
  it("recognizes Prisma auth-failure error codes", () => {
    expect(isDatabaseUnavailableError({ code: "P1000", message: "Authentication failed" })).toBe(true);
    expect(isDatabaseUnavailableError({ code: "P1010", message: "User was denied access" })).toBe(true);
  });

  it("recognizes Prisma unreachable/timeout error codes", () => {
    expect(isDatabaseUnavailableError({ code: "P1001" })).toBe(true);
    expect(isDatabaseUnavailableError({ code: "P1002" })).toBe(true);
    expect(isDatabaseUnavailableError({ code: "P1017" })).toBe(true);
  });

  it("recognizes PrismaClientInitializationError by name when no code is present", () => {
    expect(isDatabaseUnavailableError({ name: "PrismaClientInitializationError", message: "..." })).toBe(true);
  });

  it("does not classify an unrelated application error as a DB outage", () => {
    expect(isDatabaseUnavailableError(new Error("some other bug"))).toBe(false);
    expect(isDatabaseUnavailableError({ code: "P2002", message: "Unique constraint failed" })).toBe(false);
  });

  it("handles non-object / null input safely", () => {
    expect(isDatabaseUnavailableError(null)).toBe(false);
    expect(isDatabaseUnavailableError(undefined)).toBe(false);
    expect(isDatabaseUnavailableError("a string")).toBe(false);
    expect(isDatabaseUnavailableError(42)).toBe(false);
  });
});
