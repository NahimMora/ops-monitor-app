"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "◱" },
  { href: "/runs", label: "Runs", icon: "▤" },
  { href: "/incidents", label: "Incidents", icon: "⚠" },
  { href: "/ai", label: "AI", icon: "✦" },
  { href: "/machine", label: "Machine", icon: "▣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppShell({ children, adminEmail }: { children: React.ReactNode; adminEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-surface-0 text-text-primary">
      <div className="flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 border-r border-border-subtle bg-surface-1 md:flex md:flex-col">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-bg text-accent">
              <span className="size-2 rounded-[2px] bg-accent" />
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight text-text-primary">Ops Monitor</div>
              <div className="text-[11px] tracking-wide text-text-tertiary uppercase">Mission control</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`}
                >
                  {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
                  <span aria-hidden className={`w-4 text-center ${active ? "text-accent" : "text-text-tertiary"}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border-subtle px-5 py-4">
            <div className="truncate text-xs text-text-tertiary">{adminEmail}</div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-2 text-xs text-text-secondary underline decoration-border-strong underline-offset-2 hover:text-text-primary disabled:opacity-50"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-surface-1/95 backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${
                active ? "text-accent" : "text-text-tertiary"
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
