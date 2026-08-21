"use client";

/**
 * Last-resort boundary for errors outside the (protected) route group
 * (e.g. the root layout itself). Must render its own <html>/<body> since
 * it replaces the root layout entirely when triggered.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0b0d", color: "#e8eaed", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", textAlign: "center" }}>
          <div style={{ marginBottom: "0.5rem", fontSize: "1.125rem", fontWeight: 600, color: "#f87171" }}>Something went wrong</div>
          <p style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "#9aa1ac", maxWidth: "24rem" }}>
            Ops Monitor hit an unexpected error. This doesn&apos;t affect the monitored pipelines.
          </p>
          <button
            onClick={reset}
            style={{ borderRadius: "0.375rem", border: "1px solid #363c47", background: "#181b21", padding: "0.5rem 1rem", fontSize: "0.875rem", color: "#e8eaed" }}
          >
            Retry
          </button>
          {error.digest && <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#666d78" }}>Reference: {error.digest}</div>}
        </div>
      </body>
    </html>
  );
}
