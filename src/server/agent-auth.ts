/**
 * Verifies signed requests from the Windows Monitor Agent. Mirrors
 * agent/monitor_agent/api_client.py's signing scheme exactly:
 *
 *   message = "{method}\n{path}\n{timestamp}\n" + raw_body_bytes
 *   signature = HMAC_SHA256(agent_secret, message).hexdigest()
 *
 * Timestamps older/newer than REPLAY_WINDOW_SECONDS are rejected as basic
 * replay protection — this is not a substitute for TLS, just a floor.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const REPLAY_WINDOW_SECONDS = 300;

export interface AgentAuthResult {
  ok: boolean;
  agentId?: string;
  reason?: string;
}

export function verifyAgentRequest(params: {
  method: string;
  path: string;
  agentId: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): AgentAuthResult {
  const { method, path, agentId, timestamp, signature, rawBody } = params;

  if (!agentId || !timestamp || !signature) {
    return { ok: false, reason: "missing auth headers" };
  }

  const secrets = env.agentSecrets;
  const secret = secrets[agentId];
  if (!secret) {
    return { ok: false, reason: "unknown agent id" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid timestamp" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "timestamp outside replay window" };
  }

  const message = Buffer.concat([
    Buffer.from(`${method}\n${path}\n${timestamp}\n`, "utf-8"),
    Buffer.from(rawBody, "utf-8"),
  ]);
  const expected = createHmac("sha256", secret).update(message).digest("hex");

  const a = Buffer.from(signature, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true, agentId };
}
