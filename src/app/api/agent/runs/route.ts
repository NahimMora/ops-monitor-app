import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAgentAuth } from "@/server/agent-route";
import { RunsPayloadSchema } from "@/server/contracts";
import { Prisma, type RunStatus } from "@prisma/client";

const RUN_STATUS_VALUES = new Set(["RUNNING", "SUCCESS", "NO_WORK", "DEGRADED", "FAILED", "BLOCKED", "PARTIAL", "CANCELLED", "UNKNOWN"]);

function toRunStatus(value: string): RunStatus {
  const upper = value.toUpperCase();
  return (RUN_STATUS_VALUES.has(upper) ? upper : "UNKNOWN") as RunStatus;
}

export async function POST(req: NextRequest) {
  return withAgentAuth(
    req,
    (raw) => {
      const r = RunsPayloadSchema.safeParse(raw);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.message };
    },
    async (_agentId, body) => {
      const project = await prisma.project.findUnique({ where: { slug: body.project_slug } });
      if (!project) {
        return NextResponse.json({ error: "unknown project_slug" }, { status: 404 });
      }

      let upserted = 0;
      for (const run of body.runs) {
        const externalRunId = run.external_run_id || null;
        const startedAt = run.started_at ? new Date(run.started_at) : new Date();
        const finishedAt = run.finished_at ? new Date(run.finished_at) : null;
        const durationSeconds =
          finishedAt && startedAt ? Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)) : null;
        const successRate =
          run.items_total && run.items_total > 0 && run.items_success != null
            ? Math.round((run.items_success / run.items_total) * 1000) / 1000
            : null;

        const data = {
          projectId: project.id,
          externalRunId,
          startedAt,
          finishedAt,
          durationSeconds,
          status: toRunStatus(run.status),
          trigger: run.trigger,
          itemsTotal: run.items_total,
          itemsSuccess: run.items_success,
          itemsFailed: run.items_failed,
          successRate,
          currentStage: run.current_stage,
          errorCount: run.error_count,
          warningCount: run.warning_count,
          metadata: (run.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        };

        const existing = externalRunId
          ? await prisma.run.findUnique({ where: { projectId_externalRunId: { projectId: project.id, externalRunId } } })
          : null;

        const savedRun = existing
          ? await prisma.run.update({ where: { id: existing.id }, data })
          : await prisma.run.create({ data });

        if (existing) {
          await prisma.runStage.deleteMany({ where: { runId: existing.id } });
        }
        if (run.stages.length > 0) {
          await prisma.runStage.createMany({
            data: run.stages.map((stage) => ({
              runId: savedRun.id,
              name: stage.name ?? "unknown",
              displayName: stage.display_name ?? null,
              startedAt: stage.started_at ? new Date(stage.started_at) : null,
              finishedAt: stage.finished_at ? new Date(stage.finished_at) : null,
              durationSeconds: stage.duration_seconds != null ? Math.round(stage.duration_seconds) : null,
              status: toRunStatus(stage.status),
              itemsTotal: stage.items_total ?? null,
              itemsSuccess: stage.items_success ?? null,
              itemsFailed: stage.items_failed ?? null,
              errorSummary: stage.error_summary ?? null,
              channel: stage.channel ?? null,
            })),
          });
        }
        upserted += 1;
      }

      return NextResponse.json({ ok: true, upserted });
    }
  );
}
