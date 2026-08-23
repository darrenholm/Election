"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flushOutbox, outboxCount } from "@/lib/outbox";

/**
 * A standing indicator that anything logged with no signal is still safe.
 *
 * It shows only when there is something waiting, retries whenever the browser
 * says the connection is back, and otherwise every half minute. Registering
 * the service worker lives here too, so the whole progressive-web-app concern
 * sits in one component.
 *
 * The queue depth and the connection state are both external stores that React
 * does not own, so they are read through useSyncExternalStore rather than
 * mirrored into state inside an effect.
 */

function subscribeToOutbox(onChange: () => void): () => void {
  window.addEventListener("outbox:changed", onChange);
  return () => window.removeEventListener("outbox:changed", onChange);
}

function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OutboxStatus() {
  // Nothing is queued during a server render, and a server is by definition online.
  const pending = useSyncExternalStore(subscribeToOutbox, outboxCount, () => 0);
  const online = useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,
  );
  const [flushing, setFlushing] = useState(false);

  const attempt = useCallback(async () => {
    if (outboxCount() === 0) return;
    setFlushing(true);
    try {
      await flushOutbox();
    } finally {
      setFlushing(false);
    }
  }, []);

  useEffect(() => {
    // A phone can regain data without firing an `online` event, so poll gently
    // in addition to reacting to the event. Both the first attempt and the
    // reconnect attempt are deferred off the effect body so the flush's state
    // update never lands synchronously inside the effect.
    const timer = window.setInterval(() => void attempt(), 30_000);
    const kickoff = window.setTimeout(() => void attempt(), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(kickoff);
    };
  }, [attempt]);

  useEffect(() => {
    if (!online) return;
    const retry = window.setTimeout(() => void attempt(), 0);
    return () => window.clearTimeout(retry);
  }, [online, attempt]);

  // Register the service worker that makes the app installable. Failure here is
  // not worth surfacing — the app works either way.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (pending === 0 && online) return null;

  return (
    <div
      className={`no-print sticky top-0 z-30 px-4 py-1.5 text-center text-xs font-medium ${
        pending > 0
          ? "bg-accent-soft text-accent-ink"
          : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      {pending > 0 ? (
        <>
          {pending} contact{pending === 1 ? "" : "s"} waiting to upload
          {flushing ? " — sending…" : online ? "" : " — no signal"}.{" "}
          <button
            type="button"
            onClick={() => void attempt()}
            disabled={flushing}
            className="underline underline-offset-2"
          >
            Try now
          </button>
        </>
      ) : (
        <>No signal. Anything you log is held on this phone until it comes back.</>
      )}
    </div>
  );
}
