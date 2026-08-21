import Link from "next/link";
import { getOverviewData } from "@/server/dashboard-data";
import { StatusBadge, StatusDot, type ProjectStatus } from "@/components/status";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh intervalMs={7000} />

      {/* Global status strip */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            {problemCount === 0 ? (
              <span className="text-status-healthy">ALL SYSTEMS HEALTHY</span>
            ) : (
              <span className="text-status-degraded">{problemCount} PROJECT{problemCount > 1 ? "S" : ""} NEED ATTENTION</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-text-secondary">
            {healthyCount} Healthy · {problemCount} Other · Updated {relativeAge(new Date())}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.machine ? (
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                data.machine.isOnline ? "bg-status-healthy-bg text-status-healthy" : "bg-status-critical-bg text-status-critical"
              }`}
            >
              <StatusDot status={data.machine.isOnline ? "HEALTHY" : "OFFLINE"} />
              {data.machine.isOnline ? `${data.machine.hostname} online` : "MACHINE OFFLINE"}
            </span>
          ) : (
            <span className="rounded-full bg-status-offline-bg px-3 py-1.5 text-sm text-status-offline">No agent has ever reported in</span>
          )}
        </div>
      </div>

      {!data.machine?.isOnline && data.machine && (
        <div className="mb-6 rounded-xl border border-status-critical/40 bg-status-critical-bg p-4 text-sm text-status-critical">
          <div className="font-semibold">MACHINE OFFLINE</div>
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
            className="block rounded-xl border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-border-strong"
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="text-sm font-semibold text-text-primary">{project.displayName}</div>
              <StatusBadge status={project.status as ProjectStatus} />
            </div>

            {project.currentRun ? (
              <div className="mb-2 text-xs text-status-running">Running — stage: {project.currentRun.currentStage ?? "…"}</div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <div>
                <div className="text-text-tertiary">Today</div>
                <div className="text-text-primary">
                  {project.todaySuccessRate != null ? `${Math.round(project.todaySuccessRate * 100)}%` : "No data"} ({project.todayRunCount} runs)
                </div>
              </div>
              <div>
                <div className="text-text-tertiary">Last run</div>
                <div className="text-text-primary">{project.lastRun ? relativeAge(project.lastRun.finishedAt) : "No data"}</div>
              </div>
              <div>
                <div className="text-text-tertiary">Duration</div>
                <div className="text-text-primary">{project.lastRun?.durationSeconds != null ? `${project.lastRun.durationSeconds}s` : "—"}</div>
              </div>
              <div>
                <div className="text-text-tertiary">Next run</div>
                <div className="text-text-primary">{project.nextRunAt ? formatSaltaTime(new Date(project.nextRunAt)) : "—"}</div>
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
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Active incidents</h2>
        {data.activeIncidents.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm text-text-tertiary">No active incidents.</div>
        ) : (
          <div className="space-y-2">
            {data.activeIncidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/incidents#${incident.id}`}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm hover:border-border-strong"
              >
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
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">AI brief</h2>
        {data.latestBrief ? (
          <Link href="/ai" className="block rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm hover:border-border-strong">
            <div className="mb-1 text-text-tertiary">{formatSaltaDateTime(data.latestBrief.generatedAt)}</div>
            <div className="text-text-primary">{data.latestBrief.executiveSummary}</div>
          </Link>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm text-text-tertiary">
            No brief generated yet. The daily brief runs at 18:00 (America/Argentina/Salta) once GEMINI_API_KEY is configured.
          </div>
        )}
      </div>
    </div>
  );
}
