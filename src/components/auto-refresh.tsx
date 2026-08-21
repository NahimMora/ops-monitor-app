"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the current Server Component tree on an interval, giving
 * pages a "near real-time" feel via plain polling (PROMPT §11) without
 * WebSockets/SSE infrastructure. Pauses while the tab is hidden. */
export function AutoRefresh({ intervalMs = 7000 }: { intervalMs?: number }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    function handleVisibility() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
