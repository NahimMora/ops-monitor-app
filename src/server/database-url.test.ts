import { describe, it, expect } from "vitest";
import { parseDatabaseUrl } from "./database-url";

describe("parseDatabaseUrl", () => {
  it("parses a well-formed mysql URL", () => {
    const result = parseDatabaseUrl("mysql://u123456789_monitor_user:s3cret@localhost:3306/u123456789_monitor");
    expect(result).toEqual({
      host: "localhost",
      port: "3306",
      username: "u123456789_monitor_user",
      database: "u123456789_monitor",
      passwordConfigured: true,
      passwordLooksUnencoded: false,
    });
  });

  it("never includes the password anywhere in the result", () => {
    const result = parseDatabaseUrl("mysql://user:my-secret-password@host:3306/db");
    expect(JSON.stringify(result)).not.toContain("my-secret-password");
  });

  it("defaults the port to 3306 when omitted", () => {
    const result = parseDatabaseUrl("mysql://user:pass@host/db");
    expect(result.port).toBe("3306");
  });

  it("flags a missing password as not configured", () => {
    const result = parseDatabaseUrl("mysql://user@host:3306/db");
    expect(result.passwordConfigured).toBe(false);
  });

  it("rejects a non-mysql scheme", () => {
    expect(() => parseDatabaseUrl("postgres://user:pass@host:5432/db")).toThrow("mysql://");
  });

  it("rejects a malformed URL with a clear message", () => {
    expect(() => parseDatabaseUrl("not-a-url")).toThrow("not a valid URL");
  });

  it("decodes a percent-encoded username", () => {
    const result = parseDatabaseUrl("mysql://user%40name:pass@host:3306/db");
    expect(result.username).toBe("user@name");
  });

  it("does not false-positive the unencoded-password warning for an ordinary alphanumeric password", () => {
    const result = parseDatabaseUrl("mysql://user:Str0ngPassw0rd123@host:3306/db");
    expect(result.passwordLooksUnencoded).toBe(false);
  });
});
