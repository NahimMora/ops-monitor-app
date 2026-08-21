"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function NotificationToggle() {
  const [supported] = useState(() => typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    })();
  }, [supported]);

  async function subscribe() {
    setBusy(true);
    setMessage(null);
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        setMessage("VAPID keys are not configured on the server yet.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notification permission denied.");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
      setMessage("Notifications enabled.");
    } catch {
      setMessage("Could not enable notifications on this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notifications disabled.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return <div className="text-xs text-text-tertiary">Push notifications are not supported in this browser.</div>;
  }

  return (
    <div>
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        className="rounded-md border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-strong disabled:opacity-50"
      >
        {busy ? "…" : subscribed ? "Disable notifications" : "Enable notifications"}
      </button>
      {message && <div className="mt-2 text-xs text-text-secondary">{message}</div>}
    </div>
  );
}
