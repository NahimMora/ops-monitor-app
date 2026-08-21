import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/server/require-session";
import { CreateCommandSchema } from "@/server/contracts";

const COMMAND_TTL_SECONDS = 5 * 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = CreateCommandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { slug: parsed.data.project_slug } });
  if (!project) {
    return NextResponse.json({ error: "unknown project" }, { status: 404 });
  }

  const whitelist = (project.supportsCommands as string[] | null) ?? [];
  if (!whitelist.includes(parsed.data.type)) {
    return NextResponse.json(
      { error: `${project.displayName} does not support ${parsed.data.type}` },
      { status: 422 }
    );
  }

  const now = new Date();
  const command = await prisma.agentCommand.create({
    data: {
      machineId: project.machineId,
      projectId: project.id,
      type: parsed.data.type,
      status: "PENDING",
      requestedBy: session.sub,
      expiresAt: new Date(now.getTime() + COMMAND_TTL_SECONDS * 1000),
      idempotencyKey: randomUUID(),
    },
  });

  await prisma.auditEvent.create({
    data: {
      actor: session.sub,
      action: "command_requested",
      targetType: "AgentCommand",
      targetId: command.id,
      metadata: { project_slug: project.slug, type: parsed.data.type },
    },
  });

  return NextResponse.json({ ok: true, command_id: command.id, status: command.status });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const projectSlug = req.nextUrl.searchParams.get("project");
  const commands = await prisma.agentCommand.findMany({
    where: projectSlug ? { project: { slug: projectSlug } } : undefined,
    orderBy: { requestedAt: "desc" },
    take: 50,
    include: { project: { select: { slug: true, displayName: true } } },
  });
  return NextResponse.json({ commands });
}
