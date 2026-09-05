import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { Card, Note, PageHeader, StatTile } from "@/components/ui";
import { AddressWizard } from "./address-wizard";

export const dynamic = "force-dynamic";

export default async function AddressImportPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const municipalityId = campaign.municipalityId;

  const [doors, placed, streets] = await Promise.all([
    db.household.count({ where: { municipalityId } }),
    db.household.count({ where: { municipalityId, latitude: { not: null } } }),
    db.household.findMany({
      where: { municipalityId },
      distinct: ["streetKey"],
      select: { id: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Import addresses"
        subtitle={`Loading into ${campaign.municipality.name} — every door, with coordinates.`}
        actions={
          <Link href="/streets" className="btn-secondary">
            Street coverage
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Doors on file" value={doors.toLocaleString("en-CA")} />
        <StatTile
          label="On the map"
          value={placed.toLocaleString("en-CA")}
          tone="good"
          hint={doors > 0 ? `${((placed / doors) * 100).toFixed(0)}% placed` : undefined}
        />
        <StatTile label="Streets" value={streets.length.toLocaleString("en-CA")} />
        <StatTile label="Needing geocoding" value={(doors - placed).toLocaleString("en-CA")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Choose a file">
            <AddressWizard targetMunicipality={campaign.municipality.name} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Where to get one">
            <ul className="space-y-3 text-sm text-muted">
              <li>
                <strong className="text-ink">Statistics Canada&apos;s Open Database of
                Addresses.</strong> A national open dataset of civic addresses with
                coordinates, released under the Open Government Licence and
                downloadable per province as CSV. Filter it to your municipality.
              </li>
              <li>
                <strong className="text-ink">Your county&apos;s GIS open data portal.</strong>{" "}
                Most Ontario counties publish address points. Ask the GIS
                department directly if you cannot find a download.
              </li>
              <li>
                <strong className="text-ink">The municipality itself.</strong> Clerks and
                planning departments generally hold an address roll and will
                often share it with a certified candidate.
              </li>
            </ul>
          </Card>

          <Card title="Loading order">
            <Note>
              Load addresses <strong>first</strong>, then the clerk&apos;s voters&apos;
              list when it arrives. Doing it this way gives you complete door
              counts and a full map straight away, and the voters&apos; list then
              attaches people to doors that already exist.
            </Note>
            <p className="mt-3 text-sm text-muted">
              Streets are matched on a normalised form of their name, so
              &ldquo;YONGE ST S&rdquo; in one file and &ldquo;Yonge Street South&rdquo;
              in the other land on the same door rather than creating two.
              Postal code is deliberately not part of the match, since civic
              address files usually have none.
            </p>
          </Card>

          <Card title="Big files are fine">
            <p className="text-sm text-muted">
              Statistics Canada publishes Ontario as one CSV of several hundred
              megabytes covering every municipality in the province. Load it
              directly — the file is streamed in pieces and never held in memory,
              and you pick which municipality to keep. No need to split it up
              first.
            </p>
            <p className="mt-2 text-sm text-muted">
              Excel files must be saved as <strong>CSV</strong> first: File → Save
              As → CSV UTF-8.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
