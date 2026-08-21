import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAgentAuth } from "@/server/agent-route";
import { HeartbeatSchema } from "@/server/contracts";
import { deriveProjectStatus, isMachineOnline } from "@/server/status";

export async function POST(req: NextRequest) {
  return withAgentAuth(
    req,
    (raw) => {
      const r = HeartbeatSchema.safeParse(raw);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.message };
    },
    async (agentId, body) => {
      const now = new Date();

      const existing = await prisma.machine.findUnique({ where: { agentId } });
      const wasOffline = existing ? !isMachineOnline(existing.lastHeartbeatAt) : true;

      const machine = await prisma.machine.upsert({
        where: { agentId },
        create: {
          agentId,
          hostname: body.hostname,
          lastHeartbeatAt: now,
          lastSeenOnlineAt: now,
          isOnline: true,
        },
        update: {
          hostname: body.hostname,
          lastHeartbeatAt: now,
          lastSeenOnlineAt: now,
          isOnline: true,
        },
      });

      if (wasOffline) {
        await prisma.auditEvent.create({
          data: { actor: "system", action: "machine_recovered", targetType: "Machine", targetId: machine.id },
        });
      }

      for (const [slug, health] of Object.entries(body.project_health)) {
        const project = await prisma.project.findUnique({ where: { slug } });
        if (!project) continue; // unknown project slug — ignore rather than crash the whole batch

        const derived = deriveProjectStatus({
          machineOnline: true,
          adapterStatus: health.status,
          adapterReason: health.reason,
          lastSnapshotAt: now,
          now,
        });

        await prisma.$transaction([
          prisma.projectHealthSnapshot.create({
            data: {
              projectId: project.id,
              capturedAt: now,
              status: derived.status,
              reason: derived.reason,
              heartbeatAgeSeconds: health.heartbeat_age_seconds,
            },
          }),
          prisma.project.update({
            where: { id: project.id },
            data: { status: derived.status, statusReason: derived.reason, statusUpdatedAt: now },
          }),
        ]);
      }

      return NextResponse.json({ ok: true, server_time: now.toISOString() });
    }
  );
}
