"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AlertStatus } from "@prisma/client";

const SILENCE_OPTIONS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "4h", minutes: 240 },
];

export function AlertActions({ alertId, status }: { alertId: string; status: AlertStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [pickingSilence, setPickingSilence] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Failed.");
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function silence(minutes: number) {
    setPending(true);
    setError(null);
    setPickingSilence(false);
    try {
      const res = await fetch(`/api/alerts/${alertId}/silence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Failed.");
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (status === "RESOLVED") {
    return <span className="text-xs text-text-tertiary">Resolved</span>;
  }
  if (status === "OK") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "FIRING" || status === "PENDING") && (
        <button
          onClick={acknowledge}
          disabled={pending}
          className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
        >
          Acknowledge
        </button>
      )}

      {pickingSilence ? (
        <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-2 py-1">
          {SILENCE_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              onClick={() => silence(opt.minutes)}
              disabled={pending}
              className="rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            >
              {opt.label}
            </button>
          ))}
          <button onClick={() => setPickingSilence(false)} className="text-xs text-text-tertiary">
            ✕
          </button>
        </div>
      ) : (
        status !== "SILENCED" && (
          <button
            onClick={() => setPickingSilence(true)}
            disabled={pending}
            className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
          >
            Silence
          </button>
        )
      )}
      {status === "SILENCED" && <span className="text-xs text-text-tertiary">Silenced</span>}

      {error && <span className="text-xs text-status-critical">{error}</span>}
    </div>
  );
}
