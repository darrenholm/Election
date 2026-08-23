import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { redirect } from "next/navigation";
import { SUPPORT_COLORS, type SupportLevel } from "@/lib/enums";
import { Card, EmptyState, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

type Sort = "street" | "doors" | "knocked" | "identified" | "support";

/**
 * Door counts per street, which is how canvass planning actually gets done:
 * how many doors is Kent Street, how much of it have we covered, and is it
 * worth another pass.
 */
export default async function StreetsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string }>;
}) {
  const params = await searchParams;
  const sort = (params.sort ?? "doors") as Sort;
  const q = (params.q ?? "").trim();

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const households = await db.household.findMany({
    where: {
      municipalityId: campaign.municipalityId,
      ...(q ? { streetName: { contains: q.toUpperCase() } } : {}),
    },
    include: {
      turfHouseholds: {
        where: { turf: { campaignId } },
        select: { turf: { select: { id: true, name: true } } },
      },
      voters: {
        select: {
          campaignStates: {
            where: { campaignId },
            select: { supportLevel: true, doNotContact: true },
          },
          _count: { select: { contacts: { where: { campaignId } } } },
        },
      },
    },
  });

  type Row = {
    street: string;
    doors: number;
    voters: number;
    knockedDoors: number;
    identified: number;
    doNotContact: number;
    supportSum: number;
    supportCount: number;
    turfs: Set<string>;
    wards: Set<string>;
  };

  const byStreet = new Map<string, Row>();
  for (const household of households) {
    if (household.streetName === "") continue;
    let row = byStreet.get(household.streetName);
    if (!row) {
      row = {
        street: household.streetName,
        doors: 0,
        voters: 0,
        knockedDoors: 0,
        identified: 0,
        doNotContact: 0,
        supportSum: 0,
        supportCount: 0,
        turfs: new Set(),
        wards: new Set(),
      };
      byStreet.set(household.streetName, row);
    }

    row.doors++;
    row.voters += household.voters.length;
    if (household.voters.some((v) => v._count.contacts > 0)) row.knockedDoors++;
    for (const th of household.turfHouseholds) row.turfs.add(th.turf.name);
    if (household.ward) row.wards.add(household.ward);

    for (const voter of household.voters) {
      const state = voter.campaignStates[0];
      if (state?.doNotContact) row.doNotContact++;
      if (state?.supportLevel != null) {
        row.identified++;
        row.supportSum += state.supportLevel;
        row.supportCount++;
      }
    }
  }

  const rows = Array.from(byStreet.values()).sort((a, b) => {
    switch (sort) {
      case "street":
        return a.street.localeCompare(b.street);
      case "knocked":
        return pct(b.knockedDoors, b.doors) - pct(a.knockedDoors, a.doors);
      case "identified":
        return pct(b.identified, b.voters) - pct(a.identified, a.voters);
      case "support":
        return average(a.supportSum, a.supportCount) - average(b.supportSum, b.supportCount);
      case "doors":
      default:
        return b.doors - a.doors;
    }
  });

  const totalDoors = rows.reduce((n, r) => n + r.doors, 0);
  const totalKnocked = rows.reduce((n, r) => n + r.knockedDoors, 0);
  const untouched = rows.filter((r) => r.knockedDoors === 0).length;

  return (
    <>
      <PageHeader
        title="Streets"
        subtitle="Door counts and coverage, street by street — for deciding where the next canvass goes."
        actions={
          <>
            <Link href="/addresses/import" className="btn-secondary">
              Import addresses
            </Link>
            <Link href="/canvass" className="btn-secondary">
              Build turf
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Streets" value={rows.length.toLocaleString("en-CA")} />
        <StatTile label="Doors" value={totalDoors.toLocaleString("en-CA")} />
        <StatTile
          label="Doors knocked"
          value={totalKnocked.toLocaleString("en-CA")}
          hint={totalDoors > 0 ? `${pct(totalKnocked, totalDoors).toFixed(0)}% covered` : undefined}
          tone="good"
        />
        <StatTile
          label="Streets untouched"
          value={untouched}
          tone={untouched > 0 ? "warn" : "good"}
          hint="No door knocked yet"
        />
      </div>

      <Card
        actions={
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Find a street"
              className="field w-40"
            />
            <select name="sort" defaultValue={sort} className="field w-44">
              <option value="doors">Most doors</option>
              <option value="street">Street name</option>
              <option value="knocked">Least covered</option>
              <option value="identified">Least identified</option>
              <option value="support">Friendliest first</option>
            </select>
            <button type="submit" className="btn-secondary">
              Apply
            </button>
          </form>
        }
        title={`${rows.length.toLocaleString("en-CA")} streets`}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No streets on file"
            hint="Import a voters' list and the streets appear here automatically."
            action={
              <Link href="/voters/import" className="btn-primary">
                Import voters
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Street</Th>
                <Th className="text-right">Doors</Th>
                <Th className="text-right">Voters</Th>
                <Th>Knocked</Th>
                <Th>Identified</Th>
                <Th>Lean</Th>
                <Th>Turf</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const knockedPct = pct(row.knockedDoors, row.doors);
                const idPct = pct(row.identified, row.voters);
                const lean = average(row.supportSum, row.supportCount);
                return (
                  <tr key={row.street} className="hover:bg-raise">
                    <Td>
                      <Link
                        href={`/voters?street=${encodeURIComponent(row.street)}`}
                        className="font-medium hover:underline"
                      >
                        {titleCase(row.street)}
                      </Link>
                      {campaign.municipality.usesWards && row.wards.size > 0 ? (
                        <span className="block text-xs text-muted">
                          {Array.from(row.wards).join(", ")}
                        </span>
                      ) : null}
                      {row.doNotContact > 0 ? (
                        <span className="block text-xs text-muted">
                          {row.doNotContact} do not contact
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">{row.doors}</Td>
                    <Td className="text-right tabular-nums text-muted">{row.voters}</Td>
                    <Td>
                      <Meter value={knockedPct} />
                      <span className="text-xs tabular-nums text-muted">
                        {row.knockedDoors}/{row.doors} · {knockedPct.toFixed(0)}%
                      </span>
                    </Td>
                    <Td>
                      <Meter value={idPct} />
                      <span className="text-xs tabular-nums text-muted">
                        {idPct.toFixed(0)}%
                      </span>
                    </Td>
                    <Td>
                      {lean > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className={`size-2.5 rounded-full ${
                              SUPPORT_COLORS[Math.round(lean) as SupportLevel] ?? "bg-raise"
                            }`}
                          />
                          <span className="tabular-nums">{lean.toFixed(1)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-xs text-muted">
                      {row.turfs.size > 0 ? Array.from(row.turfs).join(", ") : "Unassigned"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted">
        &ldquo;Knocked&rdquo; counts a door as covered once anyone at that address has
        been contacted. &ldquo;Lean&rdquo; is the average support level of the voters
        identified on the street, so lower is friendlier.
      </p>
    </>
  );
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function average(sum: number, count: number): number {
  return count > 0 ? sum / count : 0;
}

function Meter({ value }: { value: number }) {
  return (
    <div className="mb-0.5 h-1.5 w-20 overflow-hidden rounded-full bg-raise">
      <div
        className={`h-full ${value >= 80 ? "bg-brand" : value >= 40 ? "bg-accent" : "bg-accent"}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
