"use client";

import { AutoRefresh } from "@/components/auto-refresh";

/** Thin wrapper so pages that want a pause/resume affordance (Log
 * Explorer, PROMPT §8 "pause streaming/polling") can conditionally mount
 * AutoRefresh from a server component without needing their own client
 * state — the on/off toggle itself is just a link that flips a
 * searchParam (see logs/page.tsx), which re-renders this component in
 * or out of the tree. */
export function LiveToggle({ intervalMs }: { intervalMs?: number }) {
  return <AutoRefresh intervalMs={intervalMs} />;
}
