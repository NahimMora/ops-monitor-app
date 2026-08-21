/**
 * Incident fingerprinting (see PROMPT §23): groups repeated error lines
 * into one incident instead of one row per occurrence. Pure functions
 * here are unit-tested directly; DB side-effects live in
 * recordIncidentOccurrence / autoRecoverStaleIncidents below.
 */

import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { IncidentSeverity } from "@prisma/client";

const NUMBER_PATTERN = /\d+/g;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;
const HEX_TOKEN_PATTERN = /\b0x[0-9a-f]+\b/gi;

/** Strips volatile bits (timestamps, ids, counters) so repeated
 * occurrences of "the same" error collapse to one normalized string. */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(ISO_DATE_PATTERN, "<ts>")
    .replace(UUID_PATTERN, "<uuid>")
    .replace(HEX_TOKEN_PATTERN, "<hex>")
    .replace(NUMBER_PATTERN, "<n>")
    .trim()
    .toLowerCase();
}

export function computeFingerprint(projectSlug: string, source: string, message: string): string {
  const normalized = normalizeErrorMessage(message);
  return createHash("sha1").update(`${projectSlug}:${source}:${normalized}`).digest("hex");
}

export function severityFor(level: "ERROR" | "WARNING", occurrenceCount: number): IncidentSeverity {
  if (level === "ERROR") {
    return occurrenceCount >= 20 ? "CRITICAL" : "HIGH";
  }
  return occurrenceCount >= 20 ? "HIGH" : "WARNING";
}

export function titleFor(message: string): string {
  const normalized = normalizeErrorMessage(message);
  const trimmed = normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function recordIncidentOccurrence(params: {
  projectId: string;
  projectSlug: string;
  source: string;
  level: "ERROR" | "WARNING";
  message: string;
  occurredAt: Date;
  runId?: string | null;
  channel?: string | null;
}) {
  const fingerprint = computeFingerprint(params.projectSlug, params.source, params.message);

  const incident = await prisma.incident.upsert({
    where: { projectId_fingerprint: { projectId: params.projectId, fingerprint } },
    create: {
      projectId: params.projectId,
      fingerprint,
      title: titleFor(params.message),
      severity: severityFor(params.level, 1),
      status: "ACTIVE",
      firstSeenAt: params.occurredAt,
      lastSeenAt: params.occurredAt,
      occurrenceCount: 1,
      affectedRunCount: params.runId ? 1 : 0,
      channel: params.channel ?? null,
    },
    update: {
      lastSeenAt: params.occurredAt,
      occurrenceCount: { increment: 1 },
      status: "ACTIVE", // a fresh occurrence un-resolves a previously resolved incident
      recoveredAt: null,
    },
  });

  await prisma.incidentOccurrence.create({
    data: {
      incidentId: incident.id,
      runId: params.runId ?? null,
      occurredAt: params.occurredAt,
      message: params.message,
    },
  });

  // Re-derive severity now that occurrenceCount may have crossed a
  // threshold, and bump affectedRunCount if this occurrence introduced a
  // new run.
  const updates: { severity: IncidentSeverity; affectedRunCount?: number } = {
    severity: severityFor(params.level, incident.occurrenceCount + 1),
  };
  if (params.runId) {
    const distinctRuns = await prisma.incidentOccurrence.findMany({
      where: { incidentId: incident.id, runId: { not: null } },
      select: { runId: true },
      distinct: ["runId"],
    });
    updates.affectedRunCount = distinctRuns.length;
  }
  await prisma.incident.update({ where: { id: incident.id }, data: updates });

  return incident;
}

/** Marks ACTIVE incidents recovered once no new occurrence has arrived
 * for `thresholdMinutes`. Intended to run from the periodic machine
 * health-check cron (PROMPT §32), not on every request. */
export async function autoRecoverStaleIncidents(thresholdMinutes = 30) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const stale = await prisma.incident.findMany({
    where: { status: "ACTIVE", lastSeenAt: { lt: cutoff } },
  });
  for (const incident of stale) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), recoveredAt: new Date() },
    });
  }
  return stale.map((i) => i.id);
}
