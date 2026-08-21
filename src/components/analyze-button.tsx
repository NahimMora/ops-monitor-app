"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnalyzeButton({ kind, id, hasExisting }: { kind: "run" | "incident"; id: string; hasExisting: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/analyze-${kind}/${id}${force ? "?force=true" : ""}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Analysis failed.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => analyze(false)}
        disabled={loading}
        className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
      >
        {loading ? "Analizando…" : hasExisting ? "Re-analizar" : "Analizar con IA"}
      </button>
      {error && <span className="text-xs text-status-critical">{error}</span>}
    </div>
  );
}
