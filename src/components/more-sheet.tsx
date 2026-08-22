"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MORE_ITEMS = [
  { href: "/alerts", label: "Alerts", icon: "◈" },
  { href: "/ai", label: "AI brief", icon: "✦" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

/** Mobile-only overflow sheet — the bottom nav is capped at a handful of
 * primary destinations (PROMPT §65), everything else lives here instead
 * of adding a 7th/8th tab. */
export function MoreSheet({ active, onLogout }: { active: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the sheet on navigation. Adjusted during render (React's
  // documented pattern for "state derived from a changing prop") rather
  // than in an effect, which would cause an extra commit just to close
  // a sheet that's about to be torn down by the route change anyway.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${active ? "text-accent" : "text-text-tertiary"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden className="text-base leading-none">
          ⋯
        </span>
        More
      </button>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
          <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border-subtle bg-surface-1 pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-border-strong" />
            <nav className="space-y-0.5 px-3 py-3">
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                >
                  <span aria-hidden className="w-5 text-center text-text-tertiary">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              >
                <span aria-hidden className="w-5 text-center text-text-tertiary">
                  ↩
                </span>
                Sign out
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
