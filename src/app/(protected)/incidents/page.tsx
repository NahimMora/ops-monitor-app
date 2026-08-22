import { prisma } from "@/lib/db";
import { StatusBadge, StatusRail } from "@/components/status";
import { formatSaltaDateTime } from "@/lib/timezone";
import { AnalyzeButton } from "@/components/analyze-button";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const incidents = await prisma.incident.findMany({
    include: { project: { select: { displayName: true } } },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
    take: 50,
  });
  const analyses = await prisma.aiAnalysis.findMany({ where: { incidentId: { in: incidents.map((i) => i.id) } } });
  const analysisByIncident = new Map(analyses.map((a) => [a.incidentId, a]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-primary">Incidents</h1>
      <p className="mb-5 text-sm text-text-tertiary">Open and recently resolved issues across all pipelines.</p>

      <div className="space-y-3">
        {incidents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">No incidents recorded.</div>
        )}
        {incidents.map((incident) => {
          const analysis = analysisByIncident.get(incident.id);
          const railStatus = incident.status === "RESOLVED" ? "HEALTHY" : incident.severity === "CRITICAL" ? "STUCK" : "DEGRADED";
          return (
            <div key={incident.id} id={incident.id} className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-1 p-4 pl-5">
              <StatusRail status={railStatus} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{incident.title}</div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {incident.project.displayName} · {incident.occurrenceCount} occurrences · {incident.affectedRunCount} runs affected
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-text-tertiary">
                    First: {formatSaltaDateTime(incident.firstSeenAt)} · Last: {formatSaltaDateTime(incident.lastSeenAt)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={railStatus} />
                  <span className="text-xs text-text-tertiary">{incident.status.toLowerCase()}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                <AnalyzeButton kind="incident" id={incident.id} hasExisting={Boolean(analysis)} />
              </div>
              {analysis && (
                <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">
                  {(analysis.payload as { probable_cause: string }).probable_cause}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
