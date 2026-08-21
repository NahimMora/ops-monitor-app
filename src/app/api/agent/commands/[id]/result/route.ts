import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAgentAuth } from "@/server/agent-route";
import { CommandResultSchema } from "@/server/contracts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAgentAuth(
    req,
    (raw) => {
      const r = CommandResultSchema.safeParse(raw);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.message };
    },
    async (_agentId, body) => {
      const command = await prisma.agentCommand.findUnique({ where: { id } });
      if (!command) {
        return NextResponse.json({ error: "unknown command id" }, { status: 404 });
      }
      // Idempotent: a retried result post for an already-terminal command is a no-op success.
      if (command.status === "SUCCEEDED" || command.status === "FAILED") {
        return NextResponse.json({ ok: true, note: "already recorded" });
      }

      const updated = await prisma.agentCommand.update({
        where: { id },
        data: {
          status: body.ok ? "SUCCEEDED" : "FAILED",
          result: (body.result ?? {}) as Prisma.InputJsonValue,
          exitCode: body.exit_code ?? null,
          error: body.error ?? null,
          startedAt: command.startedAt ?? command.pickedUpAt ?? new Date(),
          finishedAt: new Date(body.finished_at),
        },
      });

      await prisma.auditEvent.create({
        data: {
          actor: "agent",
          action: body.ok ? "command_succeeded" : "command_failed",
          targetType: "AgentCommand",
          targetId: updated.id,
          metadata: { type: updated.type, error: body.error ?? undefined },
        },
      });

      return NextResponse.json({ ok: true });
    }
  );
}
