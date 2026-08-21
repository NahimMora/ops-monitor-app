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
    latestBrief,
  };
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
