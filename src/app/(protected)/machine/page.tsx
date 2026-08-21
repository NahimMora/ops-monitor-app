import { prisma } from "@/lib/db";
import { isMachineOnline } from "@/server/status";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

export default async function MachinePage() {
  const machine = await prisma.machine.findFirst({ orderBy: { createdAt: "asc" } });
  const latestSnapshot = machine
    ? await prisma.machineHealthSnapshot.findFirst({ where: { machineId: machine.id }, orderBy: { capturedAt: "desc" } })
    : null;
  const schedulerTasks = machine
    ? await prisma.schedulerState.findMany({ where: { project: { machineId: machine.id } }, include: { project: { select: { displayName: true } } } })
    : [];

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">{machine.hostname}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${online ? "bg-status-healthy-bg text-status-healthy" : "bg-status-critical-bg text-status-critical"}`}>
          {online ? "Online" : "MACHINE OFFLINE"}
        </span>
      </div>

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

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Task Scheduler</h2>
        <div className="space-y-1.5">
          {schedulerTasks.length === 0 && <div className="text-xs text-text-tertiary">No data yet.</div>}
          {schedulerTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div>
                <div className="text-text-primary">{task.taskName}</div>
                <div className="text-text-tertiary">{task.project.displayName}</div>
              </div>
              <span className={task.enabled ? "text-status-healthy" : "text-status-degraded"}>{task.enabled ? "Enabled" : "Disabled"} · {task.state}</span>
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
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}
