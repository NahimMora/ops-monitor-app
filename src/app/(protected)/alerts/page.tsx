import { prisma } from "@/lib/db";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AlertActions } from "@/components/alert-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import type { AlertStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_ORDER: AlertStatus[] = ["FIRING", "PENDING", "ACKNOWLEDGED", "SILENCED", "RESOLVED", "OK"];
const STATUS_LABEL: Record<AlertStatus, string> = {
  FIRING: "Firing",
  PENDING: "Pending",
  ACKNOWLEDGED: "Acknowledged",
  SILENCED: "Silenced",
  RESOLVED: "Resolved",
  OK: "OK",
};

// Tailwind's scanner needs full class strings to appear literally in the
// source — a template-interpolated `bg-severity-${sev}` would never be
// generated. Spell every combination out instead.
const SEVERITY_CLASSES = {
  CRITICAL: { rail: "bg-severity-critical", badge: "bg-severity-critical-bg text-severity-critical" },
  WARNING: { rail: "bg-severity-warning", badge: "bg-severity-warning-bg text-severity-warning" },
  INFO: { rail: "bg-severity-info", badge: "bg-severity-info-bg text-severity-info" },
} as const;

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    where: { status: { not: "OK" } },
    include: { rule: { select: { name: true, key: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const rules = await prisma.alertRule.findMany({ orderBy: { name: "asc" } });

  const grouped = STATUS_ORDER.filter((s) => s !== "OK").map((status) => ({
    status,
    items: alerts.filter((a) => a.status === status),
  }));
  const activeCount = alerts.filter((a) => a.status === "FIRING" || a.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh intervalMs={15000} />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-primary">Alerts</h1>
      <p className="mb-5 text-sm text-text-tertiary">
        {activeCount === 0 ? "No active alerts." : `${activeCount} alert${activeCount > 1 ? "s" : ""} need attention.`}{" "}
        Evaluated every ~5 minutes against {rules.filter((r) => r.enabled).length} enabled rule
        {rules.filter((r) => r.enabled).length === 1 ? "" : "s"}.
      </p>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">
          Everything has been within thresholds — nothing to show here.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.status}>
                <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">
                  {STATUS_LABEL[group.status]} ({group.items.length})
                </h2>
                <div className="space-y-1.5">
                  {group.items.map((alert) => {
                    const sev = SEVERITY_CLASSES[alert.severity];
                    return (
                      <div key={alert.id} className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-1 p-4 pl-5">
                        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${sev.rail}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-text-primary">{alert.title}</div>
                            {alert.projectSlug && <div className="mt-0.5 text-xs text-text-tertiary">{alert.projectSlug}</div>}
                            <div className="mt-1 text-xs text-text-secondary">{alert.message}</div>
                            <div className="mt-1 font-mono text-xs text-text-tertiary">
                              Since {formatSaltaDateTime(alert.firstFiredAt)}
                              {alert.silencedUntil && alert.status === "SILENCED" ? ` · until ${formatSaltaDateTime(alert.silencedUntil)}` : ""}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${sev.badge}`}>{alert.severity}</span>
                        </div>
                        <div className="mt-3 border-t border-border-subtle pt-3">
                          <AlertActions alertId={alert.id} status={alert.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
