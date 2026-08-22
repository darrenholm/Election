"use client";

import dynamic from "next/dynamic";
import type { MapPayload } from "@/lib/map-data";

// Leaflet reaches for `window` as soon as it is imported, so the map is loaded
// only in the browser. next/dynamic with ssr:false has to be called from a
// client component, which is all this wrapper exists to be.
const CampaignMap = dynamic(
  () => import("./campaign-map").then((m) => m.CampaignMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[32rem] items-center justify-center rounded-xl border border-line bg-surface text-sm text-muted">
        Loading map…
      </div>
    ),
  },
);

export function MapShell({ initial }: { initial: MapPayload }) {
  return <CampaignMap initial={initial} />;
}
