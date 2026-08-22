"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IncidentActions({
  incidentId,
  status,
}: {
  incidentId: string;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"acknowledge" | "resolve" | null>(null);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "acknowledge" | "resolve") {
    setPending(action);
    setError(null);
    setConfirmResolve(false);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  if (status === "RESOLVED") {
    return <span className="text-xs text-text-tertiary">Resolved</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {status === "ACTIVE" && (
        <button
          onClick={() => act("acknowledge")}
          disabled={pending !== null}
          className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
        >
          {pending === "acknowledge" ? "…" : "Acknowledge"}
        </button>
      )}

      {confirmResolve ? (
        <div className="flex items-center gap-2 rounded-md border border-status-degraded/40 bg-status-degraded-bg px-2 py-1">
          <span className="text-xs text-status-degraded">Resolve this incident?</span>
          <button
            onClick={() => act("resolve")}
            className="rounded bg-status-degraded px-2 py-0.5 text-xs font-medium text-surface-0"
          >
            Yes
          </button>
          <button onClick={() => setConfirmResolve(false)} className="text-xs text-text-tertiary">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmResolve(true)}
          disabled={pending !== null}
          className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
        >
          {pending === "resolve" ? "…" : "Resolve"}
        </button>
      )}

      {error && <span className="text-xs text-status-critical">{error}</span>}
    </div>
  );
}
