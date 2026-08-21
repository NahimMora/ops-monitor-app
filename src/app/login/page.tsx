"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Login failed." }));
        setError(body.error ?? "Login failed.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-wide text-text-primary">OPS MONITOR</h1>
          <p className="mt-1 text-sm text-text-tertiary">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border-subtle bg-surface-1 p-6 shadow-2xl">
          <label className="block text-xs font-medium text-text-secondary" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 mb-4 w-full rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-status-running"
          />

          <label className="block text-xs font-medium text-text-secondary" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 mb-5 w-full rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-status-running"
          />

          {error && (
            <div role="alert" className="mb-4 rounded-md border border-status-critical/30 bg-status-critical-bg px-3 py-2 text-xs text-status-critical">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-status-running px-3 py-2 text-sm font-medium text-surface-0 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
