import { notFound } from "next/navigation";
import { getProjectDetail } from "@/server/dashboard-data";
import { StatusBadge, type ProjectStatus } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatSaltaDateTime } from "@/lib/timezone";
import { CommandControls } from "@/components/command-controls";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getProjectDetail(slug);
  if (!data) notFound();

  const { project, currentRun, lastRun, recentRuns, today, week, incidents, sessions, scheduler } = data;
  const supportedCommands = (project.supportsCommands as string[] | null) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh intervalMs={7000} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{project.displayName}</h1>
          <div className="text-sm text-text-tertiary">{project.statusReason ?? "—"}</div>
        </div>
        <StatusBadge status={project.status as ProjectStatus} />
      </div>

      {supportedCommands.length > 0 ? (
        <CommandControls projectSlug={project.slug} commands={supportedCommands} />
      ) : (
        <div className="mb-6 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-xs text-text-tertiary">
          Read-only in Ops Monitor — start/stop/restart is owned by another system for this project.
        </div>
      )}

      {currentRun && (
        <section className="mb-6 rounded-xl border border-status-running/30 bg-status-running-bg p-4">
          <div className="text-sm font-semibold text-status-running">Current run — {currentRun.currentStage ?? "running"}</div>
          <div className="mt-1 text-xs text-text-secondary">Started {formatSaltaDateTime(currentRun.startedAt)}</div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today" value={today.runCount ? `${Math.round((today.successCount / today.runCount) * 100)}%` : "No data"} sub={`${today.runCount} runs`} />
        <Stat label="7-day" value={week.runCount ? `${Math.round((week.successCount / week.runCount) * 100)}%` : "No data"} sub={`${week.runCount} runs`} />
        <Stat label="Last run" value={lastRun ? lastRun.status : "No data"} sub={lastRun ? formatSaltaDateTime(lastRun.finishedAt ?? lastRun.startedAt) : ""} />
        <Stat label="Duration" value={lastRun?.durationSeconds != null ? `${lastRun.durationSeconds}s` : "—"} sub="" />
      </div>

      {lastRun && lastRun.stages.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Stages — last run</h2>
          <div className="space-y-1.5">
            {lastRun.stages.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
                <span className="text-text-primary">{stage.displayName ?? stage.name}</span>
                <span className="flex items-center gap-3 text-text-tertiary">
                  {stage.itemsTotal != null && (
                    <span>
                      {stage.itemsSuccess ?? 0}/{stage.itemsTotal}
                    </span>
                  )}
                  {stage.durationSeconds != null && <span>{stage.durationSeconds}s</span>}
                  <StatusBadge status={stage.status as ProjectStatus} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Sessions</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
                <div className="text-text-primary capitalize">{s.sessionType}</div>
                <div className={s.status === "AUTHENTICATED" ? "text-status-healthy" : "text-status-degraded"}>{s.status.toLowerCase()}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {scheduler.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Scheduler</h2>
          <div className="space-y-1.5">
            {scheduler.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
                <span className="text-text-primary">{task.taskName}</span>
                <span className="text-text-tertiary">
                  {task.enabled ? "Enabled" : "Disabled"} · {task.state}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Recent runs</h2>
        <div className="space-y-1.5">
          {recentRuns.length === 0 && <div className="text-xs text-text-tertiary">No data</div>}
          {recentRuns.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs hover:border-border-strong"
            >
              <span className="text-text-primary">{formatSaltaDateTime(run.startedAt)}</span>
              <span className="flex items-center gap-3 text-text-tertiary">
                {run.durationSeconds != null && <span>{run.durationSeconds}s</span>}
                <StatusBadge status={run.status as ProjectStatus} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Incidents</h2>
        <div className="space-y-1.5">
          {incidents.length === 0 && <div className="text-xs text-text-tertiary">No incidents recorded.</div>}
          {incidents.map((incident) => (
            <div key={incident.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-primary">{incident.title}</span>
                <StatusBadge status={incident.status === "RESOLVED" ? "HEALTHY" : "DEGRADED"} />
              </div>
              <div className="mt-1 text-text-tertiary">{incident.occurrenceCount} occurrences · last seen {formatSaltaDateTime(incident.lastSeenAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
      <div className="text-[10px] tracking-wide text-text-tertiary uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{value}</div>
      {sub && <div className="font-mono text-xs text-text-tertiary">{sub}</div>}
    </div>
  );
}
