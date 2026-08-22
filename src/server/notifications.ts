/**
 * Web Push dispatch with fingerprint + cooldown dedupe (PROMPT §33/§60).
 * NotificationEvent.dedupeKey is unique in the DB, so the cooldown bucket
 * itself enforces "don't send this again within N minutes" — no separate
 * lock/cache needed.
 */

import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Prisma, type NotificationEventType } from "@prisma/client";

const COOLDOWN_MINUTES: Record<NotificationEventType, number> = {
  MACHINE_OFFLINE: 0, // always send immediately — this one only fires on an actual state transition
  MACHINE_RECOVERED: 0,
  PROJECT_STUCK: 30,
  PROJECT_CRASHED: 15,
  SCHEDULER_DISABLED: 60,
  INCIDENT_CRITICAL: 30,
  SESSION_EXPIRED: 60,
  PROJECT_RECOVERED: 0,
  ALERT_FIRING: 30,
  ALERT_RESOLVED: 0,
};

const TITLES: Record<NotificationEventType, string> = {
  MACHINE_OFFLINE: "Machine offline",
  MACHINE_RECOVERED: "Machine recovered",
  PROJECT_STUCK: "Project stuck",
  PROJECT_CRASHED: "Project crashed",
  SCHEDULER_DISABLED: "Scheduler unexpectedly disabled",
  INCIDENT_CRITICAL: "Critical incident",
  SESSION_EXPIRED: "Session expired",
  PROJECT_RECOVERED: "Project recovered",
  ALERT_FIRING: "Alert firing",
  ALERT_RESOLVED: "Alert resolved",
};

function vapidConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

export async function queueNotification(
  type: NotificationEventType,
  incidentId: string | null,
  payload: Record<string, unknown>,
  // Non-incident callers (the alert engine) need their own dedupe
  // discriminator — `incidentId` is a real FK to Incident and cannot be
  // reused as an arbitrary key for alert/rule identity without violating
  // the foreign key constraint. Defaults to incidentId for backward
  // compatibility with every existing incident-based call site.
  dedupeDiscriminator: string | null = incidentId
): Promise<{ sent: boolean; reason?: string }> {
  const cooldownMinutes = COOLDOWN_MINUTES[type];
  const bucket = cooldownMinutes === 0 ? Date.now() : Math.floor(Date.now() / (cooldownMinutes * 60 * 1000));
  const dedupeKey = `${type}:${dedupeDiscriminator ?? "none"}:${bucket}`;

  try {
    await prisma.notificationEvent.create({
      data: { type, incidentId, dedupeKey, payload: payload as Prisma.InputJsonValue },
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return { sent: false, reason: "deduped (within cooldown)" };
    }
    throw err;
  }

  if (!vapidConfigured()) {
    return { sent: false, reason: "VAPID keys not configured" };
  }

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  const subscriptions = await prisma.pushSubscription.findMany();
  const body = typeof payload.summary === "string" ? payload.summary : JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: TITLES[type], body, type })
        );
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
      } catch (err: unknown) {
        // A 410/404 means the subscription is gone client-side — clean it up.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
      }
    })
  );

  return { sent: true };
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}
