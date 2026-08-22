import Link from "next/link";
import { db } from "@/lib/db";
import { getMapPayload } from "@/lib/map-data";
import { geocodingConfigured } from "@/lib/geocode";
import { getCampaign } from "@/lib/campaign";
import { formatDate, toDateInput } from "@/lib/dates";
import { setTurfPlannedDate } from "@/app/actions/geocode";
import { Card, EmptyState, Note, PageHeader, StatTile } from "@/components/ui";
import { MapShell } from "@/components/map/map-shell";
import { GeocodePanel } from "@/components/map/geocode-panel";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [payload, campaign, pendingHouseholds, pendingSigns, failedHouseholds, failedSigns, turfs] =
    await Promise.all([
      getMapPayload(),
      getCampaign(),
      db.household.count({ where: { geocodeStatus: "PENDING", NOT: { streetName: "" } } }),
      db.signRequest.count({ where: { geocodeStatus: "PENDING", NOT: { addressLine: "" } } }),
      db.household.count({ where: { geocodeStatus: "FAILED" } }),
      db.signRequest.count({ where: { geocodeStatus: "FAILED" } }),
      db.turf.findMany({
        where: { status: { not: "COMPLETE" } },
        include: { _count: { select: { households: true } } },
        orderBy: [{ plannedFor: "asc" }, { name: "asc" }],
      }),
    ]);

  const knocked = payload.doors.filter((d) => d.visited).length;
  const imprecise = payload.doors.filter((d) => d.imprecise).length;
  const signsUp = payload.signs.filter(
    (s) => s.status === "INSTALLED" || s.status === "NEEDS_REPAIR",
  ).length;

  return (
    <>
      <PageHeader
        title="Map"
        subtitle={`${campaign.municipality || "Your municipality"} — where you have been, where you are going, and where the signs are.`}
        actions={
          <>
            <Link href="/addresses/import" className="btn-secondary">
              Import addresses
            </Link>
            <Link href="/canvass" className="btn-secondary">
              Turf
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Doors on the map" value={payload.doors.length.toLocaleString("en-CA")} />
        <StatTile
          label="Doors knocked"
          value={knocked.toLocaleString("en-CA")}
          hint={
            payload.doors.length > 0
              ? `${((knocked / payload.doors.length) * 100).toFixed(0)}% of placed doors`
              : undefined
          }
          tone="good"
        />
        <StatTile label="Signs up" value={signsUp} />
        <StatTile
          label="Rough locations"
          value={imprecise}
          hint="Worth checking by eye"
          tone={imprecise > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <MapShell initial={payload} />
        </div>

        <div className="space-y-6">
          <Card title="Geocoding" description="Turning addresses into map pins">
            <GeocodePanel
              configured={geocodingConfigured()}
              pendingHouseholds={pendingHouseholds}
              pendingSigns={pendingSigns}
              failed={failedHouseholds + failedSigns}
            />
          </Card>

          <Card title="Upcoming routes" description="Turf with a date is drawn as a route.">
            {turfs.length === 0 ? (
              <EmptyState
                title="No open turf"
                hint="Build turf on the canvassing page and give it a date."
              />
            ) : (
              <ul className="space-y-3">
                {turfs.map((turf) => {
                  const setDate = setTurfPlannedDate.bind(null, turf.id);
                  return (
                    <li key={turf.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <Link
                          href={`/canvass/${turf.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {turf.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted">
                          {turf._count.households} doors
                        </span>
                      </div>
                      <form action={setDate} className="mt-1 flex gap-2">
                        <input
                          name="plannedFor"
                          type="date"
                          defaultValue={toDateInput(turf.plannedFor)}
                          className="field text-xs"
                        />
                        <button type="submit" className="btn-secondary text-xs">
                          Set
                        </button>
                      </form>
                      {turf.plannedFor ? (
                        <p className="mt-1 text-xs text-muted">
                          Walking {formatDate(turf.plannedFor)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {imprecise > 0 ? (
            <Card title="Check these by eye">
              <Note tone="warn">
                {imprecise} address{imprecise === 1 ? "" : "es"} could only be placed
                on the road rather than the driveway — common on rural routes and
                concession roads. Turn on &ldquo;Only rough locations&rdquo; above to
                see them, then correct any that are badly wrong from the
                household&apos;s page.
              </Note>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {payload.doors
                  .filter((d) => d.imprecise)
                  .slice(0, 8)
                  .map((d) => (
                    <li key={d.id}>{titleCase(d.label)}</li>
                  ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
