import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAgentAuth } from "@/server/agent-route";
import { EventsBatchSchema } from "@/server/contracts";
import { recordIncidentOccurrence } from "@/server/incidents";

export async function POST(req: NextRequest) {
  return withAgentAuth(
    req,
    (raw) => {
      const r = EventsBatchSchema.safeParse(raw);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.message };
    },
    async (_agentId, body) => {
      const projectCache = new Map<string, { id: string } | null>();
      // Cache run lookups per (projectId, externalRunId) within this batch
      // — a single events_batch commonly has dozens of lines from the same
      // run, and there's no reason to hit the DB once per line for this.
      const runCache = new Map<string, string | null>();

      let stored = 0;
      let deduped = 0;
      for (const event of body.events) {
        let project = projectCache.get(event.project_slug);
        if (project === undefined) {
          project = await prisma.project.findUnique({ where: { slug: event.project_slug }, select: { id: true } });
          projectCache.set(event.project_slug, project);
        }
        if (!project) continue;

        let runId: string | null = null;
        if (event.run_external_id) {
          const runCacheKey = `${project.id}:${event.run_external_id}`;
          if (runCache.has(runCacheKey)) {
            runId = runCache.get(runCacheKey)!;
          } else {
            const run = await prisma.run.findUnique({
              where: { projectId_externalRunId: { projectId: project.id, externalRunId: event.run_external_id } },
              select: { id: true },
            });
            runId = run?.id ?? null;
            runCache.set(runCacheKey, runId);
          }
        }

        const occurredAt = new Date(event.occurred_at);

        // Storage-level dedupe: don't store the exact same normalized
        // line twice within a short window (the agent already sends only
        // new log lines, but retries/offline-buffer replay can duplicate).
        const recentDuplicate = await prisma.logEvent.findFirst({
          where: {
            projectId: project.id,
            dedupeKey: event.dedupe_key,
            occurredAt: { gte: new Date(occurredAt.getTime() - 5000) },
          },
          select: { id: true },
        });
        if (recentDuplicate) {
          deduped += 1;
          continue;
        }

        await prisma.logEvent.create({
          data: {
            projectId: project.id,
            runId,
            occurredAt,
            level: event.level,
            source: event.source,
            message: event.message,
            dedupeKey: event.dedupe_key,
          },
        });
        stored += 1;

        if (event.level === "ERROR" || event.level === "WARNING") {
          await recordIncidentOccurrence({
            projectId: project.id,
            projectSlug: event.project_slug,
            source: event.source,
            level: event.level,
            message: event.message,
            occurredAt,
            runId,
          });
        }
      }

      return NextResponse.json({ ok: true, stored, deduped });
    }
  );
}
