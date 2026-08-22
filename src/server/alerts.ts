/**
 * Deterministic alert engine (PROMPT §15/§60) — no AI involved anywhere
 * in this file. Each rule's breach test is a pure function so it can be
 * unit-tested without a DB (see alerts.test.ts); evaluateAllAlerts()
 * does the DB orchestration and state-machine transitions.
 *
 * State machine per (ruleId, projectSlug) row, mirroring how
 * src/server/incidents.ts reuses one row per fingerprint instead of
 * creating a new one per occurrence:
 *
 *   no row      + breach     -> create PENDING, firstFiredAt = now
 *   PENDING     + breach>=forMinutes -> FIRING, notify
 *   PENDING     + breach<forMinutes  -> stay PENDING
 *   FIRING/ACK/SILENCED + breach     -> stay (SILENCED reverts to FIRING
 *                                        once silencedUntil has passed)
 *   PENDING/FIRING/ACK/SILENCED + no breach -> RESOLVED, notify
 *   RESOLVED/OK + no breach          -> no-op (row kept as history)
 *
 * Machine-scoped alerts use the empty string as their `projectSlug`
 * value (not null) so the (ruleId, projectSlug) unique constraint
 * actually enforces one row per rule — MySQL treats multiple NULLs in a
 * nullable unique column as distinct, which would silently defeat
 * dedupe here.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { queueNotification } from "@/server/notifications";
import type { AlertSeverity, AlertStatus, Run } from "@prisma/client";

const MACHINE_SCOPE_SLUG = "";

export interface RuleConfig {
  thresholdMb?: number;
  thresholdMinutes?: number;
  thresholdPercent?: number;
  windowMinutes?: number;
  minSamples?: number;
  forMinutes: number;
}

export interface EvaluationResult {
  breach: boolean;
  value: unknown;
  message: string;
}

const SUCCESS_STATUSES = new Set(["SUCCESS", "NO_WORK"]);
const FAILURE_STATUSES = new Set(["FAILED", "BLOCKED"]);

/** Pure — no DB access. Machine disk-space check. */
export function evaluateMachineDiskLow(
  config: RuleConfig,
  input: { diskFreeMb: number | null }
): EvaluationResult {
  const thresholdMb = config.thresholdMb ?? 5000;
  if (input.diskFreeMb == null) {
    return { breach: false, value: null, message: "No disk telemetry yet." };
  }
  const breach = input.diskFreeMb < thresholdMb;
  return {
    breach,
    value: { diskFreeMb: input.diskFreeMb, thresholdMb },
    message: breach
      ? `Disk free ${input.diskFreeMb}MB is below the ${thresholdMb}MB threshold.`
      : `Disk free ${input.diskFreeMb}MB is healthy.`,
  };
}

/** Pure — no DB access. Staleness of the last successful run. */
export function evaluateNoRecentSuccess(
  config: RuleConfig,
  input: { minutesSinceLastSuccess: number | null }
): EvaluationResult {
  const thresholdMinutes = config.thresholdMinutes ?? 90;
  if (input.minutesSinceLastSuccess == null) {
    return { breach: false, value: null, message: "No successful run recorded yet — nothing to compare against." };
  }
  const breach = input.minutesSinceLastSuccess > thresholdMinutes;
  return {
    breach,
    value: { minutesSinceLastSuccess: Math.round(input.minutesSinceLastSuccess), thresholdMinutes },
    message: breach
      ? `No successful run in ${Math.round(input.minutesSinceLastSuccess)} minutes (threshold ${thresholdMinutes}m).`
      : `Last success ${Math.round(input.minutesSinceLastSuccess)} minutes ago — within the ${thresholdMinutes}m threshold.`,
  };
}

/** Pure — no DB access. Rolling success-rate check over a window. */
export function evaluateSuccessRateLow(
  config: RuleConfig,
  input: { runs: Array<{ status: string }> }
): EvaluationResult {
  const thresholdPercent = config.thresholdPercent ?? 60;
  const minSamples = config.minSamples ?? 3;
  const windowMinutes = config.windowMinutes ?? 60;

  if (input.runs.length < minSamples) {
    return {
      breach: false,
      value: { sampleCount: input.runs.length, minSamples },
      message: `Only ${input.runs.length} run(s) in the last ${windowMinutes}m — need at least ${minSamples} before judging success rate.`,
    };
  }

  const finished = input.runs.filter((r) => SUCCESS_STATUSES.has(r.status) || FAILURE_STATUSES.has(r.status));
  if (finished.length === 0) {
    return { breach: false, value: { sampleCount: 0 }, message: "No finished runs in window yet." };
  }
  const successCount = finished.filter((r) => SUCCESS_STATUSES.has(r.status)).length;
  const successPercent = Math.round((successCount / finished.length) * 100);
  const breach = successPercent < thresholdPercent;
  return {
    breach,
    value: { successPercent, thresholdPercent, sampleCount: finished.length, windowMinutes },
    message: breach
      ? `Success rate ${successPercent}% over the last ${windowMinutes}m (${finished.length} runs) is below the ${thresholdPercent}% threshold.`
      : `Success rate ${successPercent}% over the last ${windowMinutes}m — healthy.`,
  };
}

async function upsertAlertState(params: {
  ruleId: string;
  ruleKey: string;
  projectSlug: string | null; // null (project-agnostic display) is normalized to "" for machine scope by the caller
  severity: AlertSeverity;
  title: string;
  forMinutes: number;
  result: EvaluationResult;
  now: Date;
}) {
  const { ruleId, ruleKey, projectSlug, severity, title, forMinutes, result, now } = params;
  const dbProjectSlug = projectSlug ?? MACHINE_SCOPE_SLUG;

  const existing = await prisma.alert.findUnique({
    where: { ruleId_projectSlug: { ruleId, projectSlug: dbProjectSlug } },
  });

  if (!result.breach) {
    if (existing && !["RESOLVED", "OK"].includes(existing.status)) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { status: "RESOLVED", resolvedAt: now, lastEvaluatedAt: now, value: result.value as never, message: result.message },
      });
      await queueNotification(
        "ALERT_RESOLVED",
        null,
        { rule: ruleKey, project: projectSlug, summary: `${title}: recovered. ${result.message}` },
        `${ruleKey}:${dbProjectSlug}`
      );
    }
    return;
  }

  if (!existing) {
    await prisma.alert.create({
      data: {
        ruleId,
        projectSlug: dbProjectSlug,
        status: "PENDING",
        severity,
        title,
        message: result.message,
        value: result.value as never,
        firstFiredAt: now,
        lastEvaluatedAt: now,
      },
    });
    return;
  }

  if (existing.status === "SILENCED" && existing.silencedUntil && existing.silencedUntil > now) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { lastEvaluatedAt: now, value: result.value as never, message: result.message },
    });
    return;
  }

  if (existing.status === "PENDING") {
    const breachMinutes = (now.getTime() - existing.firstFiredAt.getTime()) / 60000;
    if (breachMinutes >= forMinutes) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { status: "FIRING", firingAt: now, lastEvaluatedAt: now, value: result.value as never, message: result.message },
      });
      await queueNotification(
        "ALERT_FIRING",
        null,
        { rule: ruleKey, project: projectSlug, summary: `${title}: ${result.message}` },
        `${ruleKey}:${dbProjectSlug}`
      );
      return;
    }
    await prisma.alert.update({
      where: { id: existing.id },
      data: { lastEvaluatedAt: now, value: result.value as never, message: result.message },
    });
    return;
  }

  // FIRING, ACKNOWLEDGED, or a SILENCED whose window just expired (falls
  // through the guard above) — still breaching, keep the status, refresh data.
  const status: AlertStatus = existing.status === "SILENCED" ? "FIRING" : existing.status;
  await prisma.alert.update({
    where: { id: existing.id },
    data: { status, lastEvaluatedAt: now, value: result.value as never, message: result.message },
  });
}

export async function evaluateAllAlerts(now: Date = new Date()): Promise<{ evaluated: number }> {
  const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
  let evaluated = 0;

  for (const rule of rules) {
    const config = rule.config as unknown as RuleConfig;

    if (rule.scope === "machine") {
      const snapshot = await prisma.machineHealthSnapshot.findFirst({ orderBy: { capturedAt: "desc" } });
      const diskFreeMb =
        snapshot && snapshot.diskTotalMb != null && snapshot.diskUsedMb != null ? snapshot.diskTotalMb - snapshot.diskUsedMb : null;
      const result = evaluateByKey(rule.key, config, { diskFreeMb });
      await upsertAlertState({ ruleId: rule.id, ruleKey: rule.key, projectSlug: null, severity: rule.severity, title: rule.name, forMinutes: config.forMinutes, result, now });
      evaluated += 1;
      continue;
    }

    // scope === "project" — when no specific projectSlug is set, apply to
    // every project that actually has discrete runs (HolaSalta Manager is
    // a continuous service with no run concept — see CURRENT_STATE.md §2).
    const allProjects = rule.projectSlug
      ? await prisma.project.findMany({ where: { slug: rule.projectSlug } })
      : await prisma.project.findMany();
    const projects = rule.projectSlug ? allProjects : allProjects.filter((p) => ((p.supportsCommands as string[] | null) ?? []).length > 0);

    for (const project of projects) {
      const result = await evaluateProjectRule(rule.key, config, project.id, now);
      await upsertAlertState({
        ruleId: rule.id,
        ruleKey: rule.key,
        projectSlug: project.slug,
        severity: rule.severity,
        title: `${rule.name} — ${project.displayName}`,
        forMinutes: config.forMinutes,
        result,
        now,
      });
      evaluated += 1;
    }
  }

  return { evaluated };
}

function evaluateByKey(key: string, config: RuleConfig, input: { diskFreeMb: number | null }): EvaluationResult {
  if (key === "machine_disk_low") return evaluateMachineDiskLow(config, input);
  throw new Error(`Unknown machine-scoped alert rule key: ${key}`);
}

async function evaluateProjectRule(key: string, config: RuleConfig, projectId: string, now: Date): Promise<EvaluationResult> {
  if (key === "project_no_recent_success") {
    const lastSuccess = await prisma.run.findFirst({
      where: { projectId, status: { in: ["SUCCESS", "NO_WORK"] } },
      orderBy: { finishedAt: "desc" },
    });
    const minutesSinceLastSuccess = lastSuccess?.finishedAt
      ? (now.getTime() - lastSuccess.finishedAt.getTime()) / 60000
      : null;
    return evaluateNoRecentSuccess(config, { minutesSinceLastSuccess });
  }

  if (key === "project_success_rate_low") {
    const windowMinutes = config.windowMinutes ?? 60;
    const windowStart = new Date(now.getTime() - windowMinutes * 60000);
    const runs: Pick<Run, "status">[] = await prisma.run.findMany({
      where: { projectId, startedAt: { gte: windowStart } },
      select: { status: true },
    });
    return evaluateSuccessRateLow(config, { runs });
  }

  throw new Error(`Unknown project-scoped alert rule key: ${key}`);
}
