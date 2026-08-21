import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyAgentRequest } from "./agent-auth";

// Matches vitest.config.ts test env: AGENT_SECRETS="test-agent:test-agent-secret"
const AGENT_ID = "test-agent";
const SECRET = "test-agent-secret";

function sign(method: string, path: string, timestamp: string, body: string) {
  const message = Buffer.concat([Buffer.from(`${method}\n${path}\n${timestamp}\n`, "utf-8"), Buffer.from(body, "utf-8")]);
  return createHmac("sha256", SECRET).update(message).digest("hex");
}

describe("verifyAgentRequest", () => {
  it("accepts a correctly signed request", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"a":1}';
    const signature = sign("POST", "/api/agent/heartbeat", timestamp, body);

    const result = verifyAgentRequest({
      method: "POST",
      path: "/api/agent/heartbeat",
      agentId: AGENT_ID,
      timestamp,
      signature,
      rawBody: body,
    });

    expect(result.ok).toBe(true);
    expect(result.agentId).toBe(AGENT_ID);
  });

  it("rejects an unknown agent id", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = verifyAgentRequest({
      method: "GET",
      path: "/api/agent/commands",
      agentId: "ghost-agent",
      timestamp,
      signature: "whatever",
      rawBody: "{}",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown agent id");
  });

  it("rejects a tampered body (signature mismatch)", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign("POST", "/api/agent/heartbeat", timestamp, '{"a":1}');
    const result = verifyAgentRequest({
      method: "POST",
      path: "/api/agent/heartbeat",
      agentId: AGENT_ID,
      timestamp,
      signature,
      rawBody: '{"a":2}', // tampered after signing
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature mismatch");
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = sign("GET", "/api/agent/commands", oldTimestamp, "{}");
    const result = verifyAgentRequest({
      method: "GET",
      path: "/api/agent/commands",
      agentId: AGENT_ID,
      timestamp: oldTimestamp,
      signature,
      rawBody: "{}",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("timestamp outside replay window");
  });

  it("rejects requests missing auth headers", () => {
    const result = verifyAgentRequest({
      method: "GET",
      path: "/api/agent/commands",
      agentId: null,
      timestamp: null,
      signature: null,
      rawBody: "{}",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing auth headers");
  });

  it("a signature computed for a different path is rejected", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign("POST", "/api/agent/telemetry", timestamp, "{}");
    const result = verifyAgentRequest({
      method: "POST",
      path: "/api/agent/heartbeat", // different path than what was signed
      agentId: AGENT_ID,
      timestamp,
      signature,
      rawBody: "{}",
    });
    expect(result.ok).toBe(false);
  });
});
