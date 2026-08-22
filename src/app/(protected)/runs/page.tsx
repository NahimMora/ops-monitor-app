import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge, StatusRail, type ProjectStatus } from "@/components/status";
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
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-primary">Run Explorer</h1>
      <p className="mb-5 text-sm text-text-tertiary">Latest 50 pipeline runs, most recent first.</p>

      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <Link
          href="/runs"
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            !params.project
              ? "border-accent/30 bg-accent-bg text-accent"
              : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
          }`}
        >
          All projects
        </Link>
        {projects.map((p) => (
          <Link
            key={p.slug}
            href={`/runs?project=${p.slug}`}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              params.project === p.slug
                ? "border-accent/30 bg-accent-bg text-accent"
                : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
            }`}
          >
            {p.displayName}
          </Link>
        ))}
      </div>

      <div className="space-y-1.5">
        {runs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">No data.</div>
        )}
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/runs/${run.id}`}
            className="relative flex items-center justify-between overflow-hidden rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 pl-5 text-sm hover:border-border-strong hover:bg-surface-2"
          >
            <StatusRail status={run.status as ProjectStatus} />
            <div>
              <div className="text-text-primary">{run.project.displayName}</div>
              <div className="font-mono text-xs text-text-tertiary">{formatSaltaDateTime(run.startedAt)}</div>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-text-secondary">
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
