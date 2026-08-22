import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge, StatusRail } from "@/components/status";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AnalyzeButton } from "@/components/analyze-button";
import { IncidentActions } from "@/components/incident-actions";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      project: true,
      occurrences: { orderBy: { occurredAt: "desc" }, take: 30 },
    },
  });
  if (!incident) notFound();

  const analysis = await prisma.aiAnalysis.findUnique({ where: { cacheKey: `incident:${incident.id}` } });
  const affectedRunIds = Array.from(new Set(incident.occurrences.map((o) => o.runId).filter((x): x is string => Boolean(x))));
  const affectedRuns = affectedRunIds.length
    ? await prisma.run.findMany({ where: { id: { in: affectedRunIds } }, orderBy: { startedAt: "desc" } })
    : [];

  const railStatus = incident.status === "RESOLVED" ? "HEALTHY" : incident.severity === "CRITICAL" ? "STUCK" : "DEGRADED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <AutoRefresh intervalMs={10000} />

      <div className="mb-1 text-xs text-text-tertiary">
        <Link href="/incidents" className="hover:text-text-secondary">
          Incidents
        </Link>{" "}
        / {incident.project.displayName}
      </div>

      <div className="relative mb-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-1 p-4 pl-5">
        <StatusRail status={railStatus} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{incident.title}</h1>
            <div className="mt-1 text-sm text-text-tertiary">{incident.project.displayName}</div>
          </div>
          <StatusBadge status={railStatus} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Occurrences" value={String(incident.occurrenceCount)} />
          <Stat label="Runs affected" value={String(incident.affectedRunCount)} />
          <Stat label="First seen" value={formatSaltaDateTime(incident.firstSeenAt)} />
          <Stat label="Last seen" value={formatSaltaDateTime(incident.lastSeenAt)} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
          <IncidentActions incidentId={incident.id} status={incident.status} />
          <span className="text-xs text-text-tertiary">
            {incident.acknowledgedAt ? `Acknowledged ${formatSaltaDateTime(incident.acknowledgedAt)}` : null}
            {incident.resolvedAt ? ` · Resolved ${formatSaltaDateTime(incident.resolvedAt)}` : null}
          </span>
        </div>
      </div>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">AI diagnosis</h2>
          <AnalyzeButton kind="incident" id={incident.id} hasExisting={Boolean(analysis)} />
        </div>
        {analysis ? (
          <AiAnalysisCard payload={analysis.payload as never} />
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-3 text-xs text-text-tertiary">Not analyzed yet.</div>
        )}
      </section>

      {affectedRuns.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Affected runs</h2>
          <div className="space-y-1.5">
            {affectedRuns.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs hover:border-border-strong"
              >
                <span className="text-text-primary">{formatSaltaDateTime(run.startedAt)}</span>
                <span className="font-mono text-text-tertiary">{run.status}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Occurrences</h2>
          <Link href={`/logs?project=${incident.project.slug}&q=${encodeURIComponent(incident.title.slice(0, 40))}`} className="text-xs text-accent hover:text-accent-strong">
            View related logs →
          </Link>
        </div>
        <div className="space-y-1.5">
          {incident.occurrences.length === 0 && <div className="text-xs text-text-tertiary">No occurrences recorded.</div>}
          {incident.occurrences.map((occ) => (
            <div key={occ.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-text-tertiary">{formatSaltaDateTime(occ.occurredAt)}</span>
                {occ.runId && (
                  <Link href={`/runs/${occ.runId}`} className="text-accent hover:text-accent-strong">
                    View run →
                  </Link>
                )}
              </div>
              <div className="mt-1 text-text-secondary">{occ.message}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-2.5">
      <div className="text-[10px] tracking-wide text-text-tertiary uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function AiAnalysisCard({ payload }: { payload: { probable_cause: string; evidence: string[]; recommended_manual_steps: string[]; confidence: number } }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-3 text-xs">
      <div className="text-text-primary">{payload.probable_cause}</div>
      {payload.evidence?.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-text-secondary">
          {payload.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {payload.recommended_manual_steps?.length > 0 && (
        <div className="mt-2">
          <div className="text-text-tertiary">Recommended checks:</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-text-secondary">
            {payload.recommended_manual_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 text-text-tertiary">Confidence: {Math.round((payload.confidence ?? 0) * 100)}%</div>
    </div>
  );
}
