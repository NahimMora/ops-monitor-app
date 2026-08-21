"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABELS: Record<string, string> = {
  START: "Start",
  STOP: "Stop",
  RESTART: "Restart",
  RUN_NOW: "Run now",
  PAUSE_SCHEDULE: "Pause schedule",
  RESUME_SCHEDULE: "Resume schedule",
};

export function CommandControls({ projectSlug, commands }: { projectSlug: string; commands: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(type: string) {
    setPending(type);
    setConfirming(null);
    setMessage(null);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_slug: projectSlug, type }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? "Command failed to queue.");
      } else {
        setMessage(`${LABELS[type] ?? type} queued.`);
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-4">
      <div className="mb-3 text-sm font-semibold text-text-secondary">Controls</div>
      <div className="flex flex-wrap gap-2">
        {commands.map((type) =>
          confirming === type ? (
            <div key={type} className="flex items-center gap-2 rounded-md border border-status-degraded/40 bg-status-degraded-bg px-2 py-1">
              <span className="text-xs text-status-degraded">Confirm {LABELS[type] ?? type}?</span>
              <button onClick={() => run(type)} className="rounded bg-status-degraded px-2 py-0.5 text-xs font-medium text-surface-0">
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
              disabled={pending !== null}
              className="rounded-md border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
            >
              {pending === type ? "…" : (LABELS[type] ?? type)}
            </button>
          )
        )}
      </div>
      {message && <div className="mt-2 text-xs text-text-secondary">{message}</div>}
    </div>
  );
}
