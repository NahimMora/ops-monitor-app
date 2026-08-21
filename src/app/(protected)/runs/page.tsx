import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge, type ProjectStatus } from "@/components/status";
import { formatSaltaDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ project?: string; status?: string }> }) {
  const params = await searchParams;
  const projects = await prisma.project.findMany({ orderBy: { displayName: "asc" } });

  const runs = await prisma.run.findMany({
    where: {
      project: params.project ? { slug: params.project } : undefined,
      status: (params.status as never) || undefined,
    },
    include: { project: { select: { displayName: true, slug: true } } },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-4 text-lg font-semibold text-text-primary">Run Explorer</h1>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link href="/runs" className={`rounded-full px-3 py-1 ${!params.project ? "bg-surface-3 text-text-primary" : "bg-surface-1 text-text-tertiary"}`}>
          All projects
        </Link>
        {projects.map((p) => (
          <Link
            key={p.slug}
            href={`/runs?project=${p.slug}`}
            className={`rounded-full px-3 py-1 ${params.project === p.slug ? "bg-surface-3 text-text-primary" : "bg-surface-1 text-text-tertiary"}`}
          >
            {p.displayName}
          </Link>
        ))}
      </div>

      <div className="space-y-1.5">
        {runs.length === 0 && <div className="text-sm text-text-tertiary">No data.</div>}
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/runs/${run.id}`}
            className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm hover:border-border-strong"
          >
            <div>
              <div className="text-text-primary">{run.project.displayName}</div>
              <div className="text-xs text-text-tertiary">{formatSaltaDateTime(run.startedAt)}</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              {run.durationSeconds != null && <span>{run.durationSeconds}s</span>}
              {run.itemsTotal != null && (
                <span>
                  {run.itemsSuccess}/{run.itemsTotal}
                </span>
              )}
              {run.successRate != null && <span>{Math.round(run.successRate * 100)}%</span>}
              <StatusBadge status={run.status as ProjectStatus} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
