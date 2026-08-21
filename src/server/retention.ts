/**
 * Deletes raw/detailed operational data older than 30 days (PROMPT §25).
 * Long-lived aggregates (DailyMetric) are computed first for any day
 * about to lose its source Run rows, so historical charts keep working
 * after cleanup. AuditEvent and AgentCommand history are intentionally
 * NOT purged here — they're low-volume audit trail, not raw telemetry.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { computeDailyMetricsForAllProjects } from "@/server/daily-metrics";

const RETENTION_DAYS = 30;

export interface RetentionResult {
  cutoff: string;
  logEventsDeleted: number;
  machineSnapshotsDeleted: number;
  projectSnapshotsDeleted: number;
  sessionHealthDeleted: number;
  runsDeleted: number;
}

export async function runRetention(retentionDays = RETENTION_DAYS): Promise<RetentionResult> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Backfill DailyMetric for every day that still has runs older than the
  // cutoff and roll them up before the source rows disappear.
  const oldestRun = await prisma.run.findFirst({ where: { startedAt: { lt: cutoff } }, orderBy: { startedAt: "asc" } });
  if (oldestRun) {
    let cursor = new Date(oldestRun.startedAt);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor < cutoff) {
      await computeDailyMetricsForAllProjects(new Date(cursor));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const [logEvents, machineSnapshots, projectSnapshots, sessionHealth, runs] = await prisma.$transaction([
    prisma.logEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
    prisma.machineHealthSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
    prisma.projectHealthSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
    prisma.sessionHealth.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
    prisma.run.deleteMany({ where: { startedAt: { lt: cutoff } } }),
  ]);

  return {
    cutoff: cutoff.toISOString(),
    logEventsDeleted: logEvents.count,
    machineSnapshotsDeleted: machineSnapshots.count,
    projectSnapshotsDeleted: projectSnapshots.count,
    sessionHealthDeleted: sessionHealth.count,
    runsDeleted: runs.count,
  };
}
