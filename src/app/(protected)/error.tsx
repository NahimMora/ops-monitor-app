"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown while rendering any protected page (most
 * commonly: the database is unreachable). Never renders the raw error
 * message — Next.js already strips server-side error details from what
 * reaches this component in production, and we don't second-guess that
 * by trying to extract more from it.
 */
export default function ProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side console only — the digest is safe to log (it's an
    // opaque correlation id, not the error content).
    console.error("Protected route render error", error.digest ?? error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-2 text-lg font-semibold text-status-critical">Database unavailable</div>
      <p className="mb-6 text-sm text-text-secondary">
        Ops Monitor couldn&apos;t reach its database. This doesn&apos;t affect the monitored pipelines — they run
        independently of this dashboard. Try again shortly.
      </p>
      <button
        onClick={reset}
        className="rounded-md border border-border-subtle bg-surface-2 px-4 py-2 text-sm font-medium text-text-primary hover:border-border-strong"
      >
        Retry
      </button>
      {error.digest && <div className="mt-4 text-xs text-text-tertiary">Reference: {error.digest}</div>}
    </div>
  );
}
