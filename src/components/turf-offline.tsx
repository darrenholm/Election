"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { downloadTurf, loadSnapshot, removeSnapshot, WALK_PATH } from "@/lib/offline-turf";
import type { TurfSnapshot } from "@/lib/turf-snapshot";

/**
 * Take this turf with you.
 *
 * Deliberate, and only ever deliberate. The app does not cache walk lists on
 * its own, because a canvasser knocking from yesterday's support levels does
 * real damage — but a township with no coverage is a real place, and the
 * honest answer there is a list the canvasser chose to freeze and can see the
 * age of. Everything logged against it queues in the usual outbox and uploads
 * when the signal comes back.
 */
export function TurfOffline({ turfId, doors }: { turfId: string; doors: number }) {
  const [saved, setSaved] = useState<TurfSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSnapshot(turfId).then((s) => {
      if (!live) return;
      setSaved(s);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [turfId]);

  const save = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setSaved(await downloadTurf(turfId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "It could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [turfId]);

  async function forget() {
    await removeSnapshot(turfId);
    setSaved(null);
  }

  return (
    <div className="no-print rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Walking somewhere with no signal
      </p>

      {saved ? (
        <>
          <p className="mt-1 text-sm">
            Saved to this device{" "}
            <strong className="whitespace-nowrap">{whenSaved(saved.capturedAt)}</strong> —{" "}
            {saved.doors.length} {saved.doors.length === 1 ? "door" : "doors"}.
          </p>
          <p className="mt-1 text-xs text-muted">
            Support levels are frozen at that moment. Anything you log at a door is held on
            the phone and uploads by itself once you are back in coverage.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={WALK_PATH} className="btn-primary">
              Open saved walk list
            </Link>
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-secondary">
              {busy ? "Updating…" : "Update it now"}
            </button>
            <button
              type="button"
              onClick={() => void forget()}
              className="text-xs text-muted underline decoration-dotted hover:text-ink"
            >
              Remove from this device
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm">
            Download these {doors} {doors === 1 ? "door" : "doors"} before you set off and the
            walk list works with no bars at all.
          </p>
          <p className="mt-1 text-xs text-muted">
            Do it at the last moment you have signal — the list you save is the list you walk,
            and it will show you how old it is.
          </p>
          <div className="mt-3">
            <button type="button" onClick={() => void save()} disabled={busy || !ready} className="btn-primary">
              {busy ? "Saving to this device…" : "Save this turf to my phone"}
            </button>
          </div>
        </>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** "at 6:14 pm" today, the date once it is not. */
export function whenSaved(iso: string): string {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();
  const time = at.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  return today ? `at ${time}` : `${at.toLocaleDateString("en-CA")}, ${time}`;
}
