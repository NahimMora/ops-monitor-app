import "server-only";
import { prisma } from "@/lib/db";
import { isMachineOnline } from "@/server/status";

export async function getOverviewData() {
  const machine = await prisma.machine.findFirst({ orderBy: { createdAt: "asc" } });
  const projects = await prisma.project.findMany({ orderBy: { displayName: "asc" } });

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const projectCards = await Promise.all(
    projects.map(async (project) => {
      const [lastRun, currentRun, schedulerTask, todayRuns, recentActivity] = await Promise.all([
        prisma.run.findFirst({ where: { projectId: project.id, finishedAt: { not: null } }, orderBy: { finishedAt: "desc" } }),
        prisma.run.findFirst({ where: { projectId: project.id, status: "RUNNING" }, orderBy: { startedAt: "desc" } }),
        prisma.schedulerState.findFirst({ where: { projectId: project.id }, orderBy: { capturedAt: "desc" } }),
        prisma.run.findMany({ where: { projectId: project.id, startedAt: { gte: dayAgo } } }),
        prisma.run.findMany({
          where: { projectId: project.id, startedAt: { gte: dayAgo } },
          select: { startedAt: true, status: true },
          orderBy: { startedAt: "asc" },
        }),
      ]);

      const successCount = todayRuns.filter((r) => r.status === "SUCCESS" || r.status === "NO_WORK").length;
      const successRate = todayRuns.length > 0 ? successCount / todayRuns.length : null;

      const recentIncident = await prisma.incident.findFirst({
        where: { projectId: project.id, status: "ACTIVE" },
        orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      });

      const sessions = await prisma.sessionHealth.findMany({
        where: { projectId: project.id },
        distinct: ["sessionType"],
        orderBy: { checkedAt: "desc" },
      });

      return {
        slug: project.slug,
        displayName: project.displayName,
        status: project.status,
        statusReason: project.statusReason,
        statusUpdatedAt: project.statusUpdatedAt,
        lastRun,
        currentRun,
        nextRunAt: schedulerTask?.nextRunAt ?? null,
        schedulerEnabled: schedulerTask?.enabled ?? null,
        todayRunCount: todayRuns.length,
        todaySuccessRate: successRate,
        activeIncident: recentIncident,
        sessions,
        activity24h: recentActivity,
      };
    })
  );

  const activeIncidents = await prisma.incident.findMany({
    where: { status: "ACTIVE" },
    include: { project: { select: { displayName: true, slug: true } } },
    orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
    take: 10,
  });

  const latestBrief = await prisma.aiBrief.findFirst({ orderBy: { generatedAt: "desc" } });
  const activeAlertCount = await prisma.alert.count({ where: { status: { in: ["FIRING", "PENDING"] } } });

  return {
    machine: machine
      ? {
          hostname: machine.hostname,
          isOnline: isMachineOnline(machine.lastHeartbeatAt),
          lastHeartbeatAt: machine.lastHeartbeatAt,
          lastSeenOnlineAt: machine.lastSeenOnlineAt,
          lastOfflineAt: machine.lastOfflineAt,
        }
      : null,
    projects: projectCards,
    activeIncidents,
    activeAlertCount,
    latestBrief,
  };
}

const MAX_CHART_POINTS = 300;

/** Downsampled machine vitals for the Machine page charts. Raw snapshots
 * arrive every ~20s (agent/monitor_agent/main.py machine_health_loop),
 * so a naive 7-day fetch is ~30k rows — more than a chart needs and more
 * than is worth serializing to the client. Evenly stride down to at most
 * MAX_CHART_POINTS instead of aggregating server-side, which is simple
 * and good enough at this data volume (PROMPT §44 — no premature
 * infrastructure for a single-admin scale). */
export async function getMachineMetricsSeries(machineId: string, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const rows = await prisma.machineHealthSnapshot.findMany({
    where: { machineId, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: { capturedAt: true, cpuPercent: true, ramUsedMb: true, ramTotalMb: true, diskUsedMb: true, diskTotalMb: true },
  });

  const stride = Math.max(1, Math.ceil(rows.length / MAX_CHART_POINTS));
  const sampled = rows.filter((_, i) => i % stride === 0);

  const percentUsed = (used: number | null, total: number | null) =>
    used != null && total != null && total > 0 ? Math.round((used / total) * 1000) / 10 : null;

  return {
    cpu: sampled.map((r) => ({ t: r.capturedAt.getTime(), v: r.cpuPercent })),
    ram: sampled.map((r) => ({ t: r.capturedAt.getTime(), v: percentUsed(r.ramUsedMb, r.ramTotalMb) })),
    disk: sampled.map((r) => ({ t: r.capturedAt.getTime(), v: percentUsed(r.diskUsedMb, r.diskTotalMb) })),
  };
}

/** 30-day success-rate trend for a project, from the long-lived
 * DailyMetric rollup (survives the 30-day raw-data retention cleanup —
 * see src/server/retention.ts). Fills gaps with runCount: 0 rather than
 * skipping days, so the chart's x-axis stays evenly spaced. */
export async function getProjectSuccessTrend(projectId: string, days = 30) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await prisma.dailyMetric.findMany({
    where: { projectId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  const points: Array<{ date: string; successPercent: number | null; runCount: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    if (!row || row.runCount === 0) {
      points.push({ date: key, successPercent: null, runCount: 0 });
    } else {
      points.push({ date: key, successPercent: Math.round((row.runSuccessCount / row.runCount) * 100), runCount: row.runCount });
    }
  }
  return points;
}

export async function getProjectDetail(slug: string) {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [currentRun, lastRun, recentRuns, todayRuns, weekRuns, incidents, sessions, scheduler, latestAnalysisRuns] =
    await Promise.all([
      prisma.run.findFirst({ where: { projectId: project.id, status: "RUNNING" }, include: { stages: true }, orderBy: { startedAt: "desc" } }),
      prisma.run.findFirst({ where: { projectId: project.id, finishedAt: { not: null } }, include: { stages: true }, orderBy: { finishedAt: "desc" } }),
      prisma.run.findMany({ where: { projectId: project.id }, orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.run.findMany({ where: { projectId: project.id, startedAt: { gte: dayAgo } } }),
      prisma.run.findMany({ where: { projectId: project.id, startedAt: { gte: weekAgo } } }),
      prisma.incident.findMany({ where: { projectId: project.id }, orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }], take: 15 }),
      prisma.sessionHealth.findMany({ where: { projectId: project.id }, distinct: ["sessionType"], orderBy: { checkedAt: "desc" } }),
      prisma.schedulerState.findMany({ where: { projectId: project.id } }),
      prisma.run.findMany({ where: { projectId: project.id }, select: { id: true }, orderBy: { startedAt: "desc" }, take: 20 }),
    ]);

  const runIds = latestAnalysisRuns.map((r) => r.id);
  const analyses = await prisma.aiAnalysis.findMany({ where: { runId: { in: runIds } } });

  return {
    project,
    currentRun,
    lastRun,
    recentRuns,
    today: { runCount: todayRuns.length, successCount: todayRuns.filter((r) => r.status === "SUCCESS" || r.status === "NO_WORK").length },
    week: { runCount: weekRuns.length, successCount: weekRuns.filter((r) => r.status === "SUCCESS" || r.status === "NO_WORK").length },
    incidents,
    sessions,
    scheduler,
    analysesByRunId: new Map(analyses.map((a) => [a.runId, a])),
  };
}
