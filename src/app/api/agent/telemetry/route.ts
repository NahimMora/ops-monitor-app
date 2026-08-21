import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAgentAuth } from "@/server/agent-route";
import { MachineTelemetrySchema, ProjectTelemetrySchema, TelemetrySchema } from "@/server/contracts";

type MachineTelemetry = import("zod").infer<typeof MachineTelemetrySchema>;

export async function POST(req: NextRequest) {
  return withAgentAuth(
    req,
    (raw) => {
      const r = TelemetrySchema.safeParse(raw);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.message };
    },
    async (agentId, body) => {
      const machine = await prisma.machine.findUnique({ where: { agentId } });
      if (!machine) {
        return NextResponse.json({ error: "unknown machine — send a heartbeat first" }, { status: 409 });
      }

      const machineParse = MachineTelemetrySchema.safeParse(body);
      if (machineParse.success) {
        const { machine: snapshot } = machineParse.data as MachineTelemetry;
        await prisma.machineHealthSnapshot.create({
          data: {
            machineId: machine.id,
            capturedAt: new Date(),
            cpuPercent: snapshot.cpu_percent,
            ramTotalMb: snapshot.ram_total_mb,
            ramUsedMb: snapshot.ram_used_mb,
            diskTotalMb: snapshot.disk_total_mb,
            diskUsedMb: snapshot.disk_used_mb,
            uptimeSeconds: Math.round(snapshot.uptime_seconds),
            chromeProcessCount: snapshot.chrome_process_count,
            chromeMemoryMb: snapshot.chrome_memory_mb,
            raw: snapshot,
          },
        });
        return NextResponse.json({ ok: true, kind: "machine" });
      }

      const projectBody = ProjectTelemetrySchema.parse(body);
      const project = await prisma.project.findUnique({ where: { slug: projectBody.project_slug } });
      if (!project) {
        return NextResponse.json({ error: "unknown project_slug" }, { status: 404 });
      }

      const now = new Date();
      for (const task of projectBody.scheduler_state) {
        await prisma.schedulerState.upsert({
          where: { projectId_taskName: { projectId: project.id, taskName: task.task_name } },
          create: {
            projectId: project.id,
            taskName: task.task_name,
            enabled: task.enabled,
            state: task.state,
            lastRunAt: task.last_run_at ? new Date(task.last_run_at) : null,
            lastRunResult: task.last_run_result,
            nextRunAt: task.next_run_at ? new Date(task.next_run_at) : null,
            capturedAt: now,
          },
          update: {
            enabled: task.enabled,
            state: task.state,
            lastRunAt: task.last_run_at ? new Date(task.last_run_at) : null,
            lastRunResult: task.last_run_result,
            nextRunAt: task.next_run_at ? new Date(task.next_run_at) : null,
            capturedAt: now,
          },
        });
      }

      for (const session of projectBody.sessions) {
        await prisma.sessionHealth.create({
          data: {
            projectId: project.id,
            sessionType: session.session_type,
            status: session.status.toUpperCase() as never,
            checkedAt: session.checked_at ? new Date(session.checked_at) : now,
            reason: session.reason ?? null,
          },
        });
      }

      return NextResponse.json({ ok: true, kind: "project" });
    }
  );
}
