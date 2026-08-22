"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LABELS: Record<string, string> = {
  START: "Start",
  STOP: "Stop",
  RESTART: "Restart",
  RUN_NOW: "Run now",
  PAUSE_SCHEDULE: "Pause schedule",
  RESUME_SCHEDULE: "Resume schedule",
};

// Danger vs. neutral matters for confirmation styling (PROMPT §30/§31) —
// STOP/RESTART interrupt a live process, PAUSE/RESUME/START don't.
const DANGER_COMMANDS = new Set(["STOP", "RESTART"]);

const STEPS: Record<string, string> = {
  PENDING: "Requested",
  PICKED_UP: "Picked up by agent",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  EXPIRED: "Expired — agent did not respond in time",
  CANCELLED: "Cancelled",
};
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"]);
const MAX_POLLS = 30; // ~60s at 2s/poll — the command TTL itself is 5 minutes, this just bounds UI polling

export function CommandControls({ projectSlug, commands }: { projectSlug: string; commands: string[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [tracking, setTracking] = useState<{ type: string; commandId: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!tracking || TERMINAL.has(tracking.status)) return;
    if (pollCount.current >= MAX_POLLS) return;

    const timer = setTimeout(async () => {
      pollCount.current += 1;
      try {
        const res = await fetch(`/api/commands?project=${projectSlug}`);
        const body = await res.json();
        const match = (body.commands ?? []).find((c: { id: string }) => c.id === tracking.commandId);
        if (match) {
          setTracking((prev) => (prev ? { ...prev, status: match.status } : prev));
          if (TERMINAL.has(match.status)) router.refresh();
        }
      } catch {
        // transient — next tick retries
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [tracking, projectSlug, router]);

  async function run(type: string) {
    setConfirming(null);
    setError(null);
    pollCount.current = 0;
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_slug: projectSlug, type }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Command failed to queue.");
        return;
      }
      setTracking({ type, commandId: body.command_id, status: "PENDING" });
      router.refresh();
    } catch {
      setError("Command failed to queue.");
    }
  }

  const pending = tracking && !TERMINAL.has(tracking.status);

  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-4">
      <div className="mb-3 text-sm font-semibold text-text-secondary">Controls</div>
      <div className="flex flex-wrap gap-2">
        {commands.map((type) =>
          confirming === type ? (
            <div key={type} className="flex items-center gap-2 rounded-md border border-status-degraded/40 bg-status-degraded-bg px-2 py-1">
              <span className="text-xs text-status-degraded">Confirm {LABELS[type] ?? type}?</span>
              <button
                onClick={() => run(type)}
                className={`rounded px-2 py-0.5 text-xs font-medium text-surface-0 ${DANGER_COMMANDS.has(type) ? "bg-action-danger" : "bg-status-degraded"}`}
              >
                Yes
              </button>
              <button onClick={() => setConfirming(null)} className="text-xs text-text-tertiary">
                Cancel
              </button>
            </div>
          ) : (
            <button
              key={type}
              onClick={() => setConfirming(type)}
              disabled={Boolean(pending)}
              className="rounded-md border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
            >
              {LABELS[type] ?? type}
            </button>
          )
        )}
      </div>

      {tracking && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs">
          <span className={pending ? "size-1.5 animate-pulse rounded-full bg-status-running" : TERMINAL.has(tracking.status) && tracking.status === "SUCCEEDED" ? "size-1.5 rounded-full bg-status-healthy" : "size-1.5 rounded-full bg-status-critical"} />
          <span className="text-text-secondary">
            {LABELS[tracking.type] ?? tracking.type}: {STEPS[tracking.status] ?? tracking.status}
          </span>
        </div>
      )}
      {error && <div className="mt-2 text-xs text-status-critical">{error}</div>}
    </div>
  );
}
