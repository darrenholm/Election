"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { MapPayload } from "@/lib/map-data";
import { SIGN_STATUSES, SIGN_TYPES, SUPPORT_LEVELS, label } from "@/lib/enums";
import "leaflet/dist/leaflet.css";

/**
 * The campaign map.
 *
 * Circle markers rather than pin icons: Leaflet's default marker images break
 * under bundlers, and at a few thousand doors circles read far better than
 * overlapping teardrops anyway.
 *
 * Tiles come from OpenStreetMap, which needs no key. Google is used only for
 * turning addresses into coordinates — its map tiles are licensed separately
 * and are not worth the cost here.
 */

/** Matches SUPPORT_COLORS in src/lib/enums.ts, as hex for Leaflet's canvas. */
const SUPPORT_HEX: Record<number, string> = {
  1: "#059669",
  2: "#84cc16",
  3: "#f59e0b",
  4: "#f97316",
  5: "#e11d48",
};

const NOT_IDENTIFIED = "#94a3b8";
const UNVISITED = "#cbd5e1";
const ROUTE_HEX = "#4f46e5";
const SIGN_UP_HEX = "#0d9488";
const SIGN_PENDING_HEX = "#d97706";

type Layers = {
  visited: boolean;
  unvisited: boolean;
  routes: boolean;
  signs: boolean;
  impreciseOnly: boolean;
};

export function CampaignMap({ initial }: { initial: MapPayload }) {
  const [data, setData] = useState(initial);
  const [layers, setLayers] = useState<Layers>({
    visited: true,
    unvisited: true,
    routes: true,
    signs: true,
    impreciseOnly: false,
  });

  // Pick up newly geocoded addresses without a full page reload.
  useEffect(() => {
    function refresh() {
      fetch("/api/map")
        .then((r) => (r.ok ? r.json() : null))
        .then((next: MapPayload | null) => next && setData(next))
        .catch(() => {});
    }
    window.addEventListener("campaign-map:refresh", refresh);
    return () => window.removeEventListener("campaign-map:refresh", refresh);
  }, []);

  const doors = useMemo(() => {
    return data.doors.filter((d) => {
      if (layers.impreciseOnly && !d.imprecise) return false;
      return d.visited ? layers.visited : layers.unvisited;
    });
  }, [data.doors, layers]);

  const centre = data.centre ?? [44.0, -81.2]; // Bruce County, a sane fallback

  if (data.doors.length === 0 && data.signs.length === 0) {
    return (
      <div className="flex h-[28rem] items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 text-center">
        <div>
          <p className="text-sm font-medium">Nothing on the map yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Addresses need coordinates before they can be drawn. Run the
            geocoder below to place them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 no-print">
        <Toggle
          on={layers.visited}
          onClick={() => setLayers((l) => ({ ...l, visited: !l.visited }))}
          swatch={SUPPORT_HEX[1]}
        >
          Doors knocked
        </Toggle>
        <Toggle
          on={layers.unvisited}
          onClick={() => setLayers((l) => ({ ...l, unvisited: !l.unvisited }))}
          swatch={UNVISITED}
        >
          Not yet knocked
        </Toggle>
        <Toggle
          on={layers.routes}
          onClick={() => setLayers((l) => ({ ...l, routes: !l.routes }))}
          swatch={ROUTE_HEX}
        >
          Upcoming routes
        </Toggle>
        <Toggle
          on={layers.signs}
          onClick={() => setLayers((l) => ({ ...l, signs: !l.signs }))}
          swatch={SIGN_UP_HEX}
        >
          Signs
        </Toggle>
        <Toggle
          on={layers.impreciseOnly}
          onClick={() => setLayers((l) => ({ ...l, impreciseOnly: !l.impreciseOnly }))}
          swatch="#a855f7"
        >
          Only rough locations
        </Toggle>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <MapContainer
          center={centre}
          zoom={13}
          scrollWheelZoom
          style={{ height: "32rem", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <FitToData payload={data} />

          {layers.routes
            ? data.routes.flatMap((route) =>
                route.segments.map((segment, i) => (
                  <Polyline
                    key={`${route.turfId}-${i}`}
                    positions={segment}
                    pathOptions={{
                      color: ROUTE_HEX,
                      weight: 3,
                      opacity: 0.55,
                      dashArray: "6 6",
                    }}
                  >
                    <Popup>
                      <strong>{route.name}</strong>
                      <br />
                      {route.doors} doors across {route.segments.length}{" "}
                      {route.segments.length === 1 ? "street" : "streets"}
                      {route.plannedFor ? (
                        <>
                          <br />
                          Walking {new Date(route.plannedFor).toLocaleDateString("en-CA")}
                        </>
                      ) : (
                        <>
                          <br />
                          No date set
                        </>
                      )}
                    </Popup>
                  </Polyline>
                )),
              )
            : null}

          {doors.map((door) => {
            const colour = !door.visited
              ? UNVISITED
              : door.support === null
                ? NOT_IDENTIFIED
                : (SUPPORT_HEX[door.support] ?? NOT_IDENTIFIED);
            return (
              <CircleMarker
                key={door.id}
                center={[door.lat, door.lng]}
                radius={door.visited ? 6 : 4}
                pathOptions={{
                  color: door.imprecise ? "#a855f7" : colour,
                  weight: door.imprecise ? 2 : 1,
                  fillColor: colour,
                  fillOpacity: door.visited ? 0.85 : 0.45,
                }}
              >
                <Popup>
                  <strong>{door.label}</strong>
                  <br />
                  {door.voters} {door.voters === 1 ? "voter" : "voters"} on file
                  <br />
                  {door.support !== null
                    ? label(SUPPORT_LEVELS as Record<string, string>, String(door.support))
                    : "Not identified"}
                  <br />
                  {door.lastContact
                    ? `Last contacted ${new Date(door.lastContact).toLocaleDateString("en-CA")}`
                    : "Never contacted"}
                  {door.imprecise ? (
                    <>
                      <br />
                      <em>Rough location — worth checking</em>
                    </>
                  ) : null}
                </Popup>
              </CircleMarker>
            );
          })}

          {layers.signs
            ? data.signs.map((sign) => {
                const up = sign.status === "INSTALLED" || sign.status === "NEEDS_REPAIR";
                return (
                  <CircleMarker
                    key={sign.id}
                    center={[sign.lat, sign.lng]}
                    radius={7}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      fillColor: up ? SIGN_UP_HEX : SIGN_PENDING_HEX,
                      fillOpacity: 0.95,
                    }}
                  >
                    <Popup>
                      <strong>{sign.label || "Sign request"}</strong>
                      <br />
                      {sign.quantity} × {label(SIGN_TYPES, sign.signType)}
                      <br />
                      {label(SIGN_STATUSES, sign.status)}
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}
        </MapContainer>
      </div>

      <p className="text-xs text-muted">
        {doors.length.toLocaleString("en-CA")} doors and{" "}
        {layers.signs ? data.signs.length.toLocaleString("en-CA") : 0} signs shown.
        Purple outlines mark addresses the geocoder could only place roughly.
      </p>
    </div>
  );
}

/** Zoom to whatever is actually on the map the first time it loads. */
function FitToData({ payload }: { payload: MapPayload }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [
      ...payload.doors.map((d) => [d.lat, d.lng] as [number, number]),
      ...payload.signs.map((s) => [s.lat, s.lng] as [number, number]),
    ];
    if (points.length === 0) return;

    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [24, 24], maxZoom: 16 },
    );
    // Fit once on load; refetches should not yank the view out from under
    // someone who has panned somewhere deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function Toggle({
  on,
  onClick,
  swatch,
  children,
}: {
  on: boolean;
  onClick: () => void;
  swatch: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        on
          ? "border-brand/40 bg-brand-soft text-brand-ink"
          : "border-line bg-surface text-muted"
      }`}
    >
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: on ? swatch : "transparent", boxShadow: `inset 0 0 0 2px ${swatch}` }}
      />
      {children}
    </button>
  );
}
