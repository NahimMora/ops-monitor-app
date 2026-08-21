import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAgentRequest } from "@/server/agent-auth";
import { checkRateLimit } from "@/server/rate-limit";

// GET carries a signed empty body ("{}") from the agent client, same as
// every other agent endpoint — see agent/monitor_agent/api_client.py.
export async function GET(req: NextRequest) {
  const path = new URL(req.url).pathname;
  const agentId = req.headers.get("x-agent-id");
  const timestamp = req.headers.get("x-agent-timestamp");
  const signature = req.headers.get("x-agent-signature");
  const rawBody = await req.text();

  const rl = checkRateLimit(`agent:${agentId ?? "unknown"}:${path}`, { maxAttempts: 120, windowSeconds: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const auth = verifyAgentRequest({ method: "GET", path, agentId, timestamp, signature, rawBody });
  if (!auth.ok) {
    return NextResponse.json({ error: `unauthorized: ${auth.reason}` }, { status: 401 });
  }

  const machine = await prisma.machine.findUnique({ where: { agentId: auth.agentId! } });
  if (!machine) {
    return NextResponse.json({ commands: [] });
  }

  const now = new Date();
  const pending = await prisma.agentCommand.findMany({
    where: { machineId: machine.id, status: "PENDING", expiresAt: { gt: now } },
    include: { project: { select: { slug: true } } },
    orderBy: { requestedAt: "asc" },
    take: 10,
  });

  if (pending.length > 0) {
    await prisma.agentCommand.updateMany({
      where: { id: { in: pending.map((c) => c.id) } },
      data: { status: "PICKED_UP", pickedUpAt: now },
    });
  }

  // Anything PENDING and past expiry gets marked EXPIRED opportunistically
  // so the dashboard doesn't show a stuck "pending" command forever.
  await prisma.agentCommand.updateMany({
    where: { machineId: machine.id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return NextResponse.json({
    commands: pending.map((c) => ({ id: c.id, project_slug: c.project.slug, type: c.type, params: {} })),
  });
}
