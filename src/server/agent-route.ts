import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifyAgentRequest } from "@/server/agent-auth";
import { checkRateLimit } from "@/server/rate-limit";

export async function withAgentAuth<T>(
  req: NextRequest,
  parse: (raw: unknown) => { success: true; data: T } | { success: false; error: string },
  handler: (agentId: string, data: T) => Promise<NextResponse>
): Promise<NextResponse> {
  const method = req.method;
  const path = new URL(req.url).pathname;
  const agentId = req.headers.get("x-agent-id");
  const timestamp = req.headers.get("x-agent-timestamp");
  const signature = req.headers.get("x-agent-signature");
  const rawBody = await req.text();

  // A misbehaving/compromised agent shouldn't be able to hammer the API —
  // this is layered on top of HMAC auth, not a replacement for it.
  const rl = checkRateLimit(`agent:${agentId ?? "unknown"}:${path}`, { maxAttempts: 120, windowSeconds: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const auth = verifyAgentRequest({ method, path, agentId, timestamp, signature, rawBody });
  if (!auth.ok) {
    return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });
  }

  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: `validation failed: ${parsed.error}` }, { status: 400 });
  }

  return handler(auth.agentId!, parsed.data);
}
