import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge, type ProjectStatus } from "@/components/status";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AnalyzeButton } from "@/components/analyze-button";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.run.findUnique({
    where: { id },
    include: { project: true, stages: true, logEvents: { orderBy: { occurredAt: "desc" }, take: 30 } },
  });
  if (!run) notFound();

  const analysis = await prisma.aiAnalysis.findUnique({ where: { cacheKey: `run:${run.id}` } });
  const relatedIncidentOccurrence = await prisma.incidentOccurrence.findFirst({
    where: { runId: run.id },
    include: { incident: { select: { id: true, title: true } } },
    orderBy: { occurredAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{run.project.displayName}</h1>
          <div className="font-mono text-xs text-text-tertiary">{formatSaltaDateTime(run.startedAt)}</div>
        </div>
        <StatusBadge status={run.status as ProjectStatus} />
      </div>

      {relatedIncidentOccurrence && (
        <Link
          href={`/incidents/${relatedIncidentOccurrence.incident.id}`}
          className="mb-4 block rounded-lg border border-status-degraded/30 bg-status-degraded-bg px-3 py-2 text-xs text-status-degraded hover:border-status-degraded/50"
        >
          Related incident: {relatedIncidentOccurrence.incident.title} →
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Duration" value={run.durationSeconds != null ? `${run.durationSeconds}s` : "—"} />
        <Stat label="Items" value={run.itemsTotal != null ? `${run.itemsSuccess}/${run.itemsTotal}` : "—"} />
        <Stat label="Errors" value={String(run.errorCount)} />
        <Stat label="Warnings" value={String(run.warningCount)} />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Stages</h2>
        <div className="space-y-1.5">
          {run.stages.map((stage) => (
            <div key={stage.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-primary">{stage.displayName ?? stage.name}</span>
                <StatusBadge status={stage.status as ProjectStatus} />
              </div>
              {stage.errorSummary && <div className="mt-1 text-status-critical">{stage.errorSummary}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">AI diagnosis</h2>
          <AnalyzeButton kind="run" id={run.id} hasExisting={Boolean(analysis)} />
        </div>
        {analysis ? (
          <AiAnalysisCard payload={analysis.payload as never} />
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-3 text-xs text-text-tertiary">
            Not analyzed yet.
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Log excerpt</h2>
          <Link href={`/logs?runId=${run.id}&range=7d`} className="text-xs text-accent hover:text-accent-strong">
            Open in Log Explorer →
          </Link>
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-surface-1 p-3 font-mono text-xs">
          {run.logEvents.length === 0 && <div className="text-text-tertiary">No log events recorded for this run.</div>}
          {run.logEvents.map((log) => (
            <div key={log.id} className={log.level === "ERROR" ? "text-status-critical" : log.level === "WARNING" ? "text-status-degraded" : "text-text-secondary"}>
              [{log.level}] {log.message}
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
      <div className="text-[10px] tracking-wide text-text-tertiary uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function AiAnalysisCard({ payload }: { payload: { probable_cause: string; recommended_manual_steps: string[]; confidence: number } }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-3 text-xs">
      <div className="text-text-primary">{payload.probable_cause}</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-text-secondary">
        {payload.recommended_manual_steps?.map((step, i) => <li key={i}>{step}</li>)}
      </ul>
      <div className="mt-2 text-text-tertiary">Confidence: {Math.round((payload.confidence ?? 0) * 100)}%</div>
    </div>
  );
}
