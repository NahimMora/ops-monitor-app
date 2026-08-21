import { describe, it, expect } from "vitest";
import { deriveProjectStatus, isMachineOnline, MACHINE_OFFLINE_THRESHOLD_SECONDS } from "./status";

describe("isMachineOnline", () => {
  it("is offline when no heartbeat has ever been received", () => {
    expect(isMachineOnline(null)).toBe(false);
  });

  it("is online within the threshold", () => {
    const now = new Date("2026-08-21T12:00:00Z");
    const last = new Date(now.getTime() - (MACHINE_OFFLINE_THRESHOLD_SECONDS - 5) * 1000);
    expect(isMachineOnline(last, now)).toBe(true);
  });

  it("is offline past the threshold", () => {
    const now = new Date("2026-08-21T12:00:00Z");
    const last = new Date(now.getTime() - (MACHINE_OFFLINE_THRESHOLD_SECONDS + 5) * 1000);
    expect(isMachineOnline(last, now)).toBe(false);
  });
});

describe("deriveProjectStatus", () => {
  const now = new Date("2026-08-21T12:00:00Z");

  it("machine offline forces UNREACHABLE regardless of adapter status", () => {
    const result = deriveProjectStatus({
      machineOnline: false,
      adapterStatus: "HEALTHY",
      adapterReason: null,
      lastSnapshotAt: now,
      now,
    });
    expect(result.status).toBe("UNREACHABLE");
  });

  it("no snapshot ever received is UNKNOWN, not HEALTHY", () => {
    const result = deriveProjectStatus({
      machineOnline: true,
      adapterStatus: "HEALTHY",
      adapterReason: null,
      lastSnapshotAt: null,
      now,
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("stale telemetry on an online machine is UNKNOWN, not a stale HEALTHY", () => {
    const staleSnapshot = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes old
    const result = deriveProjectStatus({
      machineOnline: true,
      adapterStatus: "HEALTHY",
      adapterReason: null,
      lastSnapshotAt: staleSnapshot,
      now,
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("fresh telemetry passes the adapter status through unchanged", () => {
    const result = deriveProjectStatus({
      machineOnline: true,
      adapterStatus: "DEGRADED",
      adapterReason: "session needs re-auth",
      lastSnapshotAt: now,
      now,
    });
    expect(result).toEqual({ status: "DEGRADED", reason: "session needs re-auth" });
  });
});
