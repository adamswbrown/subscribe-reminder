"use client";

import { useEffect, useState } from "react";

type State = "unsupported" | "off" | "on" | "busy" | "denied" | "unavailable";

export function PushToggle({
  save,
  remove,
  isMine,
}: {
  save: (sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) => Promise<void>;
  remove: (endpoint: string) => Promise<void>;
  isMine: (endpoint: string) => Promise<boolean>;
}) {
  const [state, setState] = useState<State>("busy");

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      // "On" only if this browser's subscription belongs to the signed-in
      // user — a previous account's subscription must read as off.
      setState(sub && (await isMine(sub.endpoint)) ? "on" : "off");
    })().catch(() => setState("unsupported"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enable() {
    setState("busy");
    try {
      const res = await fetch("/api/push/public-key");
      if (!res.ok) {
        setState("unavailable");
        return;
      }
      const { key } = await res.json();
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      // If the browser holds another account's subscription, drop it so we
      // get a fresh endpoint owned by the current user.
      const existing = await reg.pushManager.getSubscription();
      if (existing && !(await isMine(existing.endpoint))) {
        await existing.unsubscribe();
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const json = sub.toJSON();
      await save({
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      });
      setState("on");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "unsupported") {
    return (
      <p className="muted">
        Push isn&apos;t supported in this browser. On iPhone/iPad, add the app
        to your Home Screen first (Share → Add to Home Screen), then enable
        push from inside it.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="muted">
        Notifications are blocked for this site — allow them in your browser
        settings, then reload.
      </p>
    );
  }
  if (state === "unavailable") {
    return <p className="muted">Push isn&apos;t configured on the server yet.</p>;
  }

  return (
    <button
      className="btn-small"
      disabled={state === "busy"}
      onClick={state === "on" ? disable : enable}
    >
      {state === "busy"
        ? "…"
        : state === "on"
          ? "Disable push on this device"
          : "Enable push on this device"}
    </button>
  );
}
