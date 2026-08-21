import "server-only";
import { prisma } from "@/lib/db";
import { saltaCalendarDay } from "@/lib/timezone";

/** Aggregates one Salta-local calendar day's runs/incidents into
 * DailyMetric for one project — the long-lived rollup that survives the
 * 30-day raw-data retention cleanup (see src/server/retention.ts). */
export async function computeDailyMetricForDay(projectId: string, day: Date): Promise<void> {
  const dayStart = day;
  const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const runs = await prisma.run.findMany({
    where: { projectId, startedAt: { gte: dayStart, lt: dayEnd } },
    include: { stages: true },
  });

  const incidentCount = await prisma.incident.count({
    where: { projectId, firstSeenAt: { gte: dayStart, lt: dayEnd } },
  });

  let itemsTotal = 0;
  let itemsSuccess = 0;
  let runSuccessCount = 0;
  let runFailedCount = 0;
  let runDegradedCount = 0;
  const channelStats: Record<string, { success: number; failed: number }> = {};

  for (const run of runs) {
    itemsTotal += run.itemsTotal ?? 0;
    itemsSuccess += run.itemsSuccess ?? 0;
    if (run.status === "SUCCESS" || run.status === "NO_WORK") runSuccessCount += 1;
    else if (run.status === "FAILED" || run.status === "BLOCKED") runFailedCount += 1;
    else if (run.status === "DEGRADED" || run.status === "PARTIAL") runDegradedCount += 1;

    for (const stage of run.stages) {
      if (!stage.channel) continue;
      const bucket = channelStats[stage.channel] ?? { success: 0, failed: 0 };
      if (stage.status === "SUCCESS") bucket.success += 1;
      else if (stage.status === "FAILED") bucket.failed += 1;
      channelStats[stage.channel] = bucket;
    }
  }

  await prisma.dailyMetric.upsert({
    where: { projectId_date: { projectId, date: dayStart } },
    create: {
      projectId,
      date: dayStart,
      runCount: runs.length,
      runSuccessCount,
      runFailedCount,
      runDegradedCount,
      itemsTotal,
      itemsSuccess,
      incidentCount,
      channelStats,
    },
    update: {
      runCount: runs.length,
      runSuccessCount,
      runFailedCount,
      runDegradedCount,
      itemsTotal,
      itemsSuccess,
      incidentCount,
      channelStats,
    },
  });
}

export async function computeDailyMetricsForAllProjects(day: Date = saltaCalendarDay()): Promise<void> {
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const project of projects) {
    await computeDailyMetricForDay(project.id, day);
  }
}
