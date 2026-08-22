import Link from "next/link";
import { getOverviewData } from "@/server/dashboard-data";
import { StatusBadge, StatusDot, StatusRail, type ProjectStatus } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatSaltaDateTime, formatSaltaTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function relativeAge(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default async function OverviewPage() {
  const data = await getOverviewData();
  const healthyCount = data.projects.filter((p) => p.status === "HEALTHY" || p.status === "RUNNING" || p.status === "IDLE").length;
  const problemCount = data.projects.length - healthyCount;
  const attentionNeeded = problemCount > 0 || data.activeIncidents.length > 0 || data.activeAlertCount > 0;

  return (
    <div>
      <AutoRefresh intervalMs={7000} />

      {/* Hero status band */}
      <div className="grid-veil border-b border-border-subtle px-4 py-7 md:px-8 md:py-9">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-medium tracking-[0.14em] text-text-tertiary uppercase">Overview · Live</div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">
              {!attentionNeeded ? (
                <span className="text-status-healthy">All systems healthy</span>
              ) : problemCount > 0 ? (
                <span className="text-status-degraded">
                  {problemCount} project{problemCount > 1 ? "s" : ""} need attention
                </span>
              ) : (
                <span className="text-status-degraded">Attention needed</span>
              )}
            </h1>
            <div className="mt-1.5 font-mono text-sm text-text-secondary">
              {healthyCount} healthy · {problemCount} other
              {data.activeAlertCount > 0 && (
                <>
                  {" · "}
                  <Link href="/alerts" className="text-status-degraded hover:text-status-critical">
                    {data.activeAlertCount} alert{data.activeAlertCount > 1 ? "s" : ""}
                  </Link>
                </>
              )}
              {" · updated "}
              {relativeAge(new Date())}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.machine ? (
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  data.machine.isOnline
                    ? "border-status-healthy/20 bg-status-healthy-bg text-status-healthy"
                    : "border-status-critical/20 bg-status-critical-bg text-status-critical"
                }`}
              >
                <StatusDot status={data.machine.isOnline ? "HEALTHY" : "OFFLINE"} />
                {data.machine.isOnline ? `${data.machine.hostname} online` : "Machine offline"}
              </span>
            ) : (
              <span className="rounded-full border border-border-subtle bg-status-offline-bg px-3 py-1.5 text-sm text-status-offline">
                No agent has ever reported in
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        {!data.machine?.isOnline && data.machine && (
          <div className="relative mb-6 overflow-hidden rounded-xl border border-status-critical/30 bg-status-critical-bg p-4 pl-5 text-sm">
            <StatusRail status="OFFLINE" />
            <div className="font-semibold text-status-critical">Machine offline</div>
            <div className="mt-1 text-text-secondary">
              Last seen online {relativeAge(data.machine.lastSeenOnlineAt)}
              {data.machine.lastSeenOnlineAt ? ` (${formatSaltaDateTime(data.machine.lastSeenOnlineAt)})` : ""}. All project statuses below are
              unreachable, not necessarily failed — the agent cannot report while the machine or the process is down.
            </div>
          </div>
        )}

        {/* Project grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.projects.map((project) => (
            <Link
              key={project.slug}
              href={`/projects/${project.slug}`}
              className="group relative block overflow-hidden rounded-xl border border-border-subtle bg-surface-1 p-4 pl-5 transition-all hover:border-border-strong hover:bg-surface-2"
            >
              <StatusRail status={project.status as ProjectStatus} />
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">{project.displayName}</div>
                <StatusBadge status={project.status as ProjectStatus} />
              </div>

              {project.currentRun ? (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-status-running">
                  <StatusDot status="RUNNING" size={6} />
                  Running — stage: {project.currentRun.currentStage ?? "…"}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                <div>
                  <div className="text-[10px] tracking-wide text-text-tertiary uppercase">Today</div>
                  <div className="font-mono text-text-primary">
                    {project.todaySuccessRate != null ? `${Math.round(project.todaySuccessRate * 100)}%` : "—"}{" "}
                    <span className="text-text-tertiary">({project.todayRunCount})</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-wide text-text-tertiary uppercase">Last run</div>
                  <div className="font-mono text-text-primary">{project.lastRun ? relativeAge(project.lastRun.finishedAt) : "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] tracking-wide text-text-tertiary uppercase">Duration</div>
                  <div className="font-mono text-text-primary">
                    {project.lastRun?.durationSeconds != null ? `${project.lastRun.durationSeconds}s` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-wide text-text-tertiary uppercase">Next run</div>
                  <div className="font-mono text-text-primary">{project.nextRunAt ? formatSaltaTime(new Date(project.nextRunAt)) : "—"}</div>
                </div>
              </div>

              {project.activeIncident && (
                <div className="mt-3 rounded-md bg-status-degraded-bg px-2.5 py-1.5 text-xs text-status-degraded">
                  {project.activeIncident.title}
                </div>
              )}

              {project.sessions.some((s) => s.status !== "AUTHENTICATED") && (
                <div className="mt-2 text-xs text-status-degraded">Session needs attention</div>
              )}
            </Link>
          ))}
        </div>

        {/* Active incidents */}
        <div className="mt-9">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Active incidents</h2>
          {data.activeIncidents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">No active incidents.</div>
          ) : (
            <div className="space-y-2">
              {data.activeIncidents.map((incident) => (
                <Link
                  key={incident.id}
                  href={`/incidents#${incident.id}`}
                  className="relative flex items-center justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 pl-5 text-sm hover:border-border-strong"
                >
                  <StatusRail status={incident.severity === "CRITICAL" || incident.severity === "HIGH" ? "FAILED" : "DEGRADED"} />
                  <div>
                    <div className="text-text-primary">{incident.title}</div>
                    <div className="mt-0.5 text-xs text-text-tertiary">
                      {incident.project.displayName} · {incident.occurrenceCount} occurrences
                    </div>
                  </div>
                  <StatusBadge status={incident.severity === "CRITICAL" || incident.severity === "HIGH" ? "FAILED" : "DEGRADED"} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* AI Brief */}
        <div className="mt-9">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">AI brief</h2>
          {data.latestBrief ? (
            <Link href="/ai" className="block rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm hover:border-border-strong">
              <div className="mb-1 font-mono text-xs text-text-tertiary">{formatSaltaDateTime(data.latestBrief.generatedAt)}</div>
              <div className="text-text-primary">{data.latestBrief.executiveSummary}</div>
            </Link>
          ) : (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">
              No brief generated yet. The daily brief runs at 18:00 (America/Argentina/Salta) once GEMINI_API_KEY is configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
