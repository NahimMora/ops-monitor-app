import { prisma } from "@/lib/db";
import { formatSaltaDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const briefs = await prisma.aiBrief.findMany({ orderBy: { generatedAt: "desc" }, take: 14 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-primary">AI Ops Brief</h1>
      <p className="mb-6 text-sm text-text-tertiary">
        Generated daily at 18:00 (America/Argentina/Salta) by Gemini, from pre-aggregated, redacted operational data — never raw logs.
      </p>

      {briefs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">
          No briefs generated yet. Configure GEMINI_API_KEY and the Hostinger cron job (see docs/AI_ANALYSIS.md).
        </div>
      )}

      <div className="space-y-4">
        {briefs.map((brief) => {
          const payload = brief.payload as {
            important_incidents: string[];
            recurring_patterns: string[];
            probable_causes: string[];
            recommended_actions: string[];
            healthy_components: string[];
            risks: string[];
            confidence: number;
          };
          return (
            <div key={brief.id} className="rounded-xl border border-border-subtle bg-surface-1 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-xs text-text-tertiary">{formatSaltaDateTime(brief.generatedAt)}</div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
                    brief.overallStatus === "healthy"
                      ? "bg-status-healthy-bg text-status-healthy"
                      : brief.overallStatus === "degraded"
                        ? "bg-status-degraded-bg text-status-degraded"
                        : "bg-status-critical-bg text-status-critical"
                  }`}
                >
                  {brief.overallStatus}
                </span>
              </div>
              <p className="text-sm text-text-primary">{brief.executiveSummary}</p>

              {payload.recommended_actions?.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-text-secondary">Acciones recomendadas</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-text-secondary">
                    {payload.recommended_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 font-mono text-xs text-text-tertiary">Confianza: {Math.round((payload.confidence ?? 0) * 100)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
