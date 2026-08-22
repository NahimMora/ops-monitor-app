import Link from "next/link";
import { prisma } from "@/lib/db";
import { isMachineOnline } from "@/server/status";
import { getMachineMetricsSeries } from "@/server/dashboard-data";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AutoRefresh } from "@/components/auto-refresh";
import { AreaMetricChart } from "@/components/charts/area-metric-chart";

export const dynamic = "force-dynamic";

const WINDOWS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export default async function MachinePage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const params = await searchParams;
  const window = params.window && WINDOWS[params.window] ? params.window : "6h";

  const machine = await prisma.machine.findFirst({ orderBy: { createdAt: "asc" } });
  const latestSnapshot = machine
    ? await prisma.machineHealthSnapshot.findFirst({ where: { machineId: machine.id }, orderBy: { capturedAt: "desc" } })
    : null;
  const schedulerTasks = machine
    ? await prisma.schedulerState.findMany({ where: { project: { machineId: machine.id } }, include: { project: { select: { displayName: true } } } })
    : [];
  const series = machine ? await getMachineMetricsSeries(machine.id, WINDOWS[window]) : null;

  if (!machine) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm text-text-tertiary">
          No agent has reported in yet. Install the agent (docs/WINDOWS_AGENT.md) to populate this page.
        </div>
      </div>
    );
  }

  const online = isMachineOnline(machine.lastHeartbeatAt);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh intervalMs={10000} />
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{machine.hostname}</h1>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
            online ? "border-status-healthy/20 bg-status-healthy-bg text-status-healthy" : "border-status-critical/20 bg-status-critical-bg text-status-critical"
          }`}
        >
          <span className={`size-1.5 rounded-full ${online ? "bg-status-healthy" : "bg-status-critical"}`} />
          {online ? "Online" : "Machine offline"}
        </span>
      </div>
      <p className="mb-5 text-sm text-text-tertiary">Windows agent host running the pipeline schedulers.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="CPU" value={latestSnapshot ? `${latestSnapshot.cpuPercent?.toFixed(0)}%` : "Unavailable"} />
        <Stat label="RAM" value={latestSnapshot ? `${latestSnapshot.ramUsedMb}/${latestSnapshot.ramTotalMb} MB` : "Unavailable"} />
        <Stat label="Disk" value={latestSnapshot ? `${latestSnapshot.diskUsedMb}/${latestSnapshot.diskTotalMb} MB` : "Unavailable"} />
        <Stat
          label="Uptime"
          value={latestSnapshot?.uptimeSeconds != null ? `${(latestSnapshot.uptimeSeconds / 3600).toFixed(1)}h` : "Unavailable"}
        />
        <Stat label="Chrome/Chromium procs" value={latestSnapshot ? String(latestSnapshot.chromeProcessCount) : "Unavailable"} />
        <Stat label="Chrome memory" value={latestSnapshot ? `${latestSnapshot.chromeMemoryMb} MB` : "Unavailable"} />
        <Stat label="Last heartbeat" value={machine.lastHeartbeatAt ? formatSaltaDateTime(machine.lastHeartbeatAt) : "never"} />
        <Stat label="Last seen online" value={machine.lastSeenOnlineAt ? formatSaltaDateTime(machine.lastSeenOnlineAt) : "never"} />
      </div>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Trends</h2>
          <div className="flex gap-1.5 text-xs">
            {Object.keys(WINDOWS).map((w) => (
              <Link
                key={w}
                href={`/machine?window=${w}`}
                className={`rounded-full border px-2.5 py-0.5 font-medium transition-colors ${
                  window === w
                    ? "border-accent/30 bg-accent-bg text-accent"
                    : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
                }`}
              >
                {w}
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs text-text-tertiary">CPU</div>
            <AreaMetricChart data={series?.cpu ?? []} unit="%" color="var(--status-running)" formatValue={(v) => `${Math.round(v)}`} />
          </div>
          <div>
            <div className="mb-1 text-xs text-text-tertiary">RAM used</div>
            <AreaMetricChart data={series?.ram ?? []} unit="%" color="var(--accent)" formatValue={(v) => `${Math.round(v)}`} />
          </div>
          <div>
            <div className="mb-1 text-xs text-text-tertiary">Disk used</div>
            <AreaMetricChart data={series?.disk ?? []} unit="%" color="var(--status-degraded)" formatValue={(v) => `${Math.round(v)}`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Task scheduler</h2>
        <div className="space-y-1.5">
          {schedulerTasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-xs text-text-tertiary">No data yet.</div>
          )}
          {schedulerTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div>
                <div className="text-text-primary">{task.taskName}</div>
                <div className="text-text-tertiary">{task.project.displayName}</div>
              </div>
              <span className={`font-mono ${task.enabled ? "text-status-healthy" : "text-status-degraded"}`}>
                {task.enabled ? "Enabled" : "Disabled"} · {task.state}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
      <div className="text-[10px] tracking-wide text-text-tertiary uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}
