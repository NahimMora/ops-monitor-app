/**
 * Deterministic status derivation (see docs section "AI is not
 * monitoring" / PROMPT §46-47). The heavy lifting already happens
 * project-side in the Python adapters (they know their own heartbeat/
 * scheduler contracts) — this module only adds the two judgments that
 * ONLY the cloud can make: whether the machine itself is reachable, and
 * whether telemetry for a project has gone stale even though the
 * machine is online. Gemini is never consulted here.
 */

import type { ProjectStatus } from "@/server/contracts";

export const MACHINE_OFFLINE_THRESHOLD_SECONDS = 45; // ~3.75x the 12s heartbeat interval
export const PROJECT_SNAPSHOT_STALE_SECONDS = 120; // ~6x the 20s telemetry interval

export function isMachineOnline(lastHeartbeatAt: Date | null, now: Date = new Date()): boolean {
  if (!lastHeartbeatAt) return false;
  return (now.getTime() - lastHeartbeatAt.getTime()) / 1000 <= MACHINE_OFFLINE_THRESHOLD_SECONDS;
}

export interface DeriveProjectStatusInput {
  machineOnline: boolean;
  adapterStatus: ProjectStatus | null; // last status the agent reported for this project, if any
  adapterReason: string | null;
  lastSnapshotAt: Date | null;
  now?: Date;
}

export interface DerivedProjectStatus {
  status: ProjectStatus;
  reason: string | null;
}

export function deriveProjectStatus(input: DeriveProjectStatusInput): DerivedProjectStatus {
  const now = input.now ?? new Date();

  if (!input.machineOnline) {
    return { status: "UNREACHABLE", reason: "machine offline" };
  }

  if (!input.lastSnapshotAt) {
    return { status: "UNKNOWN", reason: "no telemetry received yet" };
  }

  const ageSeconds = (now.getTime() - input.lastSnapshotAt.getTime()) / 1000;
  if (ageSeconds > PROJECT_SNAPSHOT_STALE_SECONDS) {
    return { status: "UNKNOWN", reason: `no telemetry for ${Math.round(ageSeconds)}s (machine is online)` };
  }

  if (!input.adapterStatus) {
    return { status: "UNKNOWN", reason: "no status reported" };
  }

  return { status: input.adapterStatus, reason: input.adapterReason };
}
