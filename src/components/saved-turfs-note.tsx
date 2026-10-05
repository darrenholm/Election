"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSnapshots, WALK_PATH } from "@/lib/offline-turf";
import { whenSaved } from "@/components/turf-offline";

/**
 * A line on the canvassing page when this device is carrying a turf.
 *
 * It exists so a saved list cannot be forgotten about. A copy that is a week
 * old and still being walked is exactly the failure the app refuses to risk by
 * caching anything on its own, so the one it does keep says its age wherever it
 * is mentioned.
 */
export function SavedTurfsNote() {
  const [saved, setSaved] = useState<{ turfId: string; name: string; capturedAt: string }[]>([]);

  useEffect(() => {
    const load = () =>
      void listSnapshots().then((all) =>
        setSaved(all.map((s) => ({ turfId: s.turfId, name: s.name, capturedAt: s.capturedAt }))),
      );
    load();
    window.addEventListener("offline-turfs:changed", load);
    return () => window.removeEventListener("offline-turfs:changed", load);
  }, []);

  if (saved.length === 0) return null;

  return (
    <div className="no-print mb-6 rounded-xl border border-line bg-surface p-4 text-sm shadow-sm">
      <p>
        <strong>On this device for walking without signal:</strong>{" "}
        {saved.map((s, i) => (
          <span key={s.turfId}>
            {i > 0 ? ", " : ""}
            {s.name} <span className="text-muted">(saved {whenSaved(s.capturedAt)})</span>
          </span>
        ))}
        .
      </p>
      <Link href={WALK_PATH} className="mt-2 inline-block text-xs font-medium text-brand underline">
        Open the saved walk list
      </Link>
    </div>
  );
}
