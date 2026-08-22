import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatSaltaDateTime } from "@/lib/timezone";
import { LiveToggle } from "@/components/live-toggle";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};
const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"] as const;

interface SearchParams {
  project?: string;
  level?: string;
  source?: string;
  runId?: string;
  q?: string;
  range?: string;
  live?: string;
}

function buildHref(base: SearchParams, overrides: SearchParams): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const projects = await prisma.project.findMany({ orderBy: { displayName: "asc" } });
  const range = params.range && RANGES[params.range] ? params.range : "1h";
  const live = params.live !== "off";

  const now = new Date();
  const where: Prisma.LogEventWhereInput = {
    occurredAt: { gte: new Date(now.getTime() - RANGES[range]) },
  };
  if (params.project) where.project = { slug: params.project };
  if (params.level && (LEVELS as readonly string[]).includes(params.level)) where.level = params.level as (typeof LEVELS)[number];
  if (params.source) where.source = { contains: params.source };
  if (params.runId) where.runId = params.runId;
  if (params.q) where.message = { contains: params.q };

  const logs = await prisma.logEvent.findMany({
    where,
    include: { project: { select: { displayName: true, slug: true } } },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  const activeFilterCount = [params.project, params.level, params.source, params.runId, params.q].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      {live && <LiveToggle intervalMs={8000} />}

      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Log Explorer</h1>
        <Link
          href={buildHref(params, { live: live ? "off" : undefined })}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            live ? "border-status-healthy/30 bg-status-healthy-bg text-status-healthy" : "border-border-subtle bg-surface-1 text-text-tertiary"
          }`}
        >
          {live ? "● Live" : "Paused"}
        </Link>
      </div>
      <p className="mb-5 text-sm text-text-tertiary">
        Last {logs.length} of up to 200 matching events in the last {range}.
        {params.runId && (
          <>
            {" "}
            Scoped to run{" "}
            <Link href={`/runs/${params.runId}`} className="text-accent hover:text-accent-strong">
              {params.runId}
            </Link>
            .
          </>
        )}
      </p>

      {/* Time range */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {Object.keys(RANGES).map((r) => (
          <Link
            key={r}
            href={buildHref(params, { range: r })}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              range === r
                ? "border-accent/30 bg-accent-bg text-accent"
                : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
            }`}
          >
            {r}
          </Link>
        ))}
      </div>

      {/* Project filter */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Link
          href={buildHref(params, { project: undefined })}
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
            href={buildHref(params, { project: p.slug })}
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

      {/* Level filter */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link
          href={buildHref(params, { level: undefined })}
          className={`rounded-full border px-3 py-1 font-medium transition-colors ${
            !params.level
              ? "border-accent/30 bg-accent-bg text-accent"
              : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
          }`}
        >
          All levels
        </Link>
        {LEVELS.map((lvl) => (
          <Link
            key={lvl}
            href={buildHref(params, { level: lvl })}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              params.level === lvl
                ? "border-accent/30 bg-accent-bg text-accent"
                : "border-border-subtle bg-surface-1 text-text-tertiary hover:border-border-strong hover:text-text-secondary"
            }`}
          >
            {lvl}
          </Link>
        ))}
      </div>

      {/* Free-text search */}
      <form method="get" className="mb-5 flex gap-2">
        {params.project && <input type="hidden" name="project" value={params.project} />}
        {params.level && <input type="hidden" name="level" value={params.level} />}
        {params.range && <input type="hidden" name="range" value={params.range} />}
        {params.runId && <input type="hidden" name="runId" value={params.runId} />}
        <input
          type="text"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search message text…"
          className="w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-lg border border-border-subtle bg-surface-2 px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong">
          Search
        </button>
      </form>

      <div className="space-y-1.5">
        {logs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-tertiary">
            No log events match these filters.
            {activeFilterCount > 0 && (
              <>
                {" "}
                <Link href="/logs" className="text-accent hover:text-accent-strong">
                  Clear filters
                </Link>
              </>
            )}
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-text-tertiary">
                <span>{formatSaltaDateTime(log.occurredAt)}</span>
                <LevelBadge level={log.level} />
                <span className="text-text-secondary">{log.project.displayName}</span>
                <span>· {log.source}</span>
              </div>
              {log.runId && (
                <Link href={`/runs/${log.runId}`} className="shrink-0 text-accent hover:text-accent-strong">
                  View run →
                </Link>
              )}
            </div>
            <div
              className={`mt-1 break-words ${
                log.level === "ERROR" ? "text-status-critical" : log.level === "WARNING" ? "text-status-degraded" : "text-text-secondary"
              }`}
            >
              {log.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const color =
    level === "ERROR" ? "text-status-critical" : level === "WARNING" ? "text-status-degraded" : level === "INFO" ? "text-status-running" : "text-text-tertiary";
  return <span className={`font-semibold ${color}`}>{level}</span>;
}
