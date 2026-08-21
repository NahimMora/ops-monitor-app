export type ProjectStatus =
  | "HEALTHY"
  | "RUNNING"
  | "IDLE"
  | "DEGRADED"
  | "STUCK"
  | "FAILED"
  | "STOPPED"
  | "OFFLINE"
  | "UNREACHABLE"
  | "UNKNOWN";

interface StatusStyle {
  label: string;
  colorVar: string;
  bgVar: string;
  pulse: boolean;
}

const STATUS_STYLES: Record<ProjectStatus, StatusStyle> = {
  HEALTHY: { label: "Healthy", colorVar: "var(--status-healthy)", bgVar: "var(--status-healthy-bg)", pulse: false },
  RUNNING: { label: "Running", colorVar: "var(--status-running)", bgVar: "var(--status-running-bg)", pulse: true },
  IDLE: { label: "Idle", colorVar: "var(--text-secondary)", bgVar: "var(--surface-2)", pulse: false },
  DEGRADED: { label: "Degraded", colorVar: "var(--status-degraded)", bgVar: "var(--status-degraded-bg)", pulse: false },
  STUCK: { label: "Stuck", colorVar: "var(--status-critical)", bgVar: "var(--status-critical-bg)", pulse: true },
  FAILED: { label: "Failed", colorVar: "var(--status-critical)", bgVar: "var(--status-critical-bg)", pulse: false },
  STOPPED: { label: "Stopped", colorVar: "var(--status-offline)", bgVar: "var(--status-offline-bg)", pulse: false },
  OFFLINE: { label: "Offline", colorVar: "var(--status-offline)", bgVar: "var(--status-offline-bg)", pulse: false },
  UNREACHABLE: { label: "Unreachable", colorVar: "var(--status-offline)", bgVar: "var(--status-offline-bg)", pulse: false },
  UNKNOWN: { label: "Unknown", colorVar: "var(--text-tertiary)", bgVar: "var(--surface-2)", pulse: false },
};

export function statusStyle(status: ProjectStatus): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.UNKNOWN;
}

export function StatusDot({ status, size = 8 }: { status: ProjectStatus; size?: number }) {
  const style = statusStyle(status);
  return (
    <span
      className="relative inline-block rounded-full"
      style={{ width: size, height: size, backgroundColor: style.colorVar, color: style.colorVar }}
    >
      {style.pulse && <span className="status-pulse absolute inset-0" />}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const style = statusStyle(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: style.bgVar, color: style.colorVar }}
    >
      <StatusDot status={status} size={6} />
      {style.label}
    </span>
  );
}
