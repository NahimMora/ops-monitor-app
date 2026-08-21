/**
 * Builds the compact, pre-aggregated payload sent to Gemini for the
 * daily brief (PROMPT §28-29). Never sends raw logs — everything here is
 * already filtered, fingerprint-grouped, counted, and redacted.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { redact } from "@/server/sanitize";

export interface DailyBriefPayload {
  window: { start: string; end: string };
  projects: Array<{
    slug: string;
    displayName: string;
    runCount: number;
    successCount: number;
    failedCount: number;
    degradedCount: number;
    itemsTotal: number;
    itemsSuccess: number;
    channelStats: Record<string, { success: number; failed: number }>;
  }>;
  incidents: Array<{
    project: string;
    title: string;
    severity: string;
    status: string;
    occurrenceCount: number;
    affectedRunCount: number;
    firstSeen: string;
    lastSeen: string;
    channel: string | null;
    sampleMessages: string[];
  }>;
  recovered: Array<{ project: string; title: string; recoveredAt: string }>;
}

export async function buildDailyBriefPayload(windowStart: Date, windowEnd: Date): Promise<DailyBriefPayload> {
  const projects = await prisma.project.findMany();

  const projectSummaries = await Promise.all(
    projects.map(async (project) => {
      const runs = await prisma.run.findMany({
        where: { projectId: project.id, startedAt: { gte: windowStart, lt: windowEnd } },
        include: { stages: true },
      });
      let successCount = 0;
      let failedCount = 0;
      let degradedCount = 0;
      let itemsTotal = 0;
      let itemsSuccess = 0;
      const channelStats: Record<string, { success: number; failed: number }> = {};
      for (const run of runs) {
        itemsTotal += run.itemsTotal ?? 0;
        itemsSuccess += run.itemsSuccess ?? 0;
        if (run.status === "SUCCESS" || run.status === "NO_WORK") successCount += 1;
        else if (run.status === "FAILED" || run.status === "BLOCKED") failedCount += 1;
        else if (run.status === "DEGRADED" || run.status === "PARTIAL") degradedCount += 1;
        for (const stage of run.stages) {
          if (!stage.channel) continue;
          const bucket = channelStats[stage.channel] ?? { success: 0, failed: 0 };
          if (stage.status === "SUCCESS") bucket.success += 1;
          else if (stage.status === "FAILED") bucket.failed += 1;
          channelStats[stage.channel] = bucket;
        }
      }
      return {
        slug: project.slug,
        displayName: project.displayName,
        runCount: runs.length,
        successCount,
        failedCount,
        degradedCount,
        itemsTotal,
        itemsSuccess,
        channelStats,
      };
    })
  );

  const incidents = await prisma.incident.findMany({
    where: { lastSeenAt: { gte: windowStart, lt: windowEnd } },
    include: { project: true, occurrences: { orderBy: { occurredAt: "desc" }, take: 3 } },
  });

  const recovered = await prisma.incident.findMany({
    where: { recoveredAt: { gte: windowStart, lt: windowEnd } },
    include: { project: true },
  });

  return {
    window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    projects: projectSummaries,
    incidents: incidents.map((incident) => ({
      project: incident.project.displayName,
      title: redact(incident.title),
      severity: incident.severity,
      status: incident.status,
      occurrenceCount: incident.occurrenceCount,
      affectedRunCount: incident.affectedRunCount,
      firstSeen: incident.firstSeenAt.toISOString(),
      lastSeen: incident.lastSeenAt.toISOString(),
      channel: incident.channel,
      sampleMessages: incident.occurrences.map((o) => redact(o.message).slice(0, 300)),
    })),
    recovered: recovered.map((incident) => ({
      project: incident.project.displayName,
      title: redact(incident.title),
      recoveredAt: incident.recoveredAt!.toISOString(),
    })),
  };
}
