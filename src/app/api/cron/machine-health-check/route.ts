/**
 * Runs every ~5 minutes from Hostinger Cron (see docs/HOSTINGER_DEPLOYMENT.md).
 * This is the mechanism from PROMPT §32: the cloud, not the agent, is
 * what notices the agent went silent — because a dead agent obviously
 * can't report its own death.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/server/cron-auth";
import { deriveProjectStatus, isMachineOnline } from "@/server/status";
import { autoRecoverStaleIncidents } from "@/server/incidents";
import { queueNotification } from "@/server/notifications";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const machines = await prisma.machine.findMany({ include: { projects: true } });
  const results: Record<string, unknown> = {};

  for (const machine of machines) {
    const online = isMachineOnline(machine.lastHeartbeatAt, now);
    if (online !== machine.isOnline) {
      await prisma.machine.update({
        where: { id: machine.id },
        data: { isOnline: online, lastOfflineAt: online ? machine.lastOfflineAt : now },
      });
      await prisma.auditEvent.create({
        data: {
          actor: "system",
          action: online ? "machine_recovered" : "machine_offline_detected",
          targetType: "Machine",
          targetId: machine.id,
        },
      });
      await queueNotification(online ? "MACHINE_RECOVERED" : "MACHINE_OFFLINE", null, {
        machine_id: machine.id,
        hostname: machine.hostname,
      });

      if (!online) {
        // Machine offline -> every project on it becomes UNREACHABLE
        // immediately, rather than waiting for the next stale heartbeat
        // read on each project individually.
        for (const project of machine.projects) {
          const derived = deriveProjectStatus({ machineOnline: false, adapterStatus: null, adapterReason: null, lastSnapshotAt: null, now });
          await prisma.project.update({
            where: { id: project.id },
            data: { status: derived.status, statusReason: derived.reason, statusUpdatedAt: now },
          });
        }
      }
    }
    results[machine.hostname] = { online };
  }

  const recovered = await autoRecoverStaleIncidents(30);

  return NextResponse.json({ ok: true, machines: results, incidentsRecovered: recovered.length });
}
