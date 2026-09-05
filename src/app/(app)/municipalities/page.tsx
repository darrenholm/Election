import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, EmptyState, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { HarvestWizard } from "./harvest-wizard";
import { ClearAddresses } from "./clear-addresses";

export const dynamic = "force-dynamic";

/**
 * The list of towns the app knows about.
 *
 * Ontario has 444 municipalities and there is no machine-readable roll of them
 * that this app can fetch. The address file has one, though — every
 * municipality that publishes address points appears in its municipality
 * column — so the list is read out of the file the campaign already downloaded.
 */
export default async function MunicipalitiesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const municipalities = await db.municipality.findMany({
    include: { _count: { select: { campaigns: true, households: true, voters: true } } },
    orderBy: { name: "asc" },
  });

  const inUse = municipalities.filter((m) => m._count.campaigns > 0);
  const withDoors = municipalities.filter((m) => m._count.households > 0);

  return (
    <>
      <PageHeader
        title="Municipalities"
        subtitle="Every town the app knows about. Doors and electors belong to the town; what a campaign learns at those doors belongs to the campaign."
        actions={
          <Link href="/campaigns" className="btn-secondary">
            Campaigns
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="On file" value={municipalities.length.toLocaleString("en-CA")} />
        <StatTile label="With a campaign" value={inUse.length.toLocaleString("en-CA")} />
        <StatTile label="With addresses loaded" value={withDoors.length.toLocaleString("en-CA")} />
        <StatTile
          label="Doors on file"
          value={municipalities
            .reduce((n, m) => n + m._count.households, 0)
            .toLocaleString("en-CA")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="On file">
            {municipalities.length === 0 ? (
              <EmptyState
                title="No municipalities yet"
                hint="Harvest them from your address file, or create one when you add a campaign."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Municipality</Th>
                    <Th className="text-right">Campaigns</Th>
                    <Th className="text-right">Doors</Th>
                    <Th className="text-right">Electors</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {municipalities.map((m) => (
                    <tr key={m.id}>
                      <Td>{m.name}</Td>
                      <Td className="text-right tabular-nums">{m._count.campaigns.toLocaleString("en-CA")}</Td>
                      <Td className="text-right tabular-nums">{m._count.households.toLocaleString("en-CA")}</Td>
                      <Td className="text-right tabular-nums">{m._count.voters.toLocaleString("en-CA")}</Td>
                      <Td>
                        {me.isAdmin ? (
                          <ClearAddresses
                            municipalityId={m.id}
                            name={m.name}
                            doors={m._count.households}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Harvest from an address file">
            <HarvestWizard existingNames={municipalities.map((m) => m.name)} />
          </Card>

          <Card title="What this does">
            <p className="text-sm text-muted">
              Statistics Canada&apos;s Open Database of Addresses names the
              municipality on every address point. Reading that column across the
              whole Ontario file gives you the list of municipalities in it, which
              is then saved as empty records — a name and nothing else.
            </p>
            <p className="mt-2 text-sm text-muted">
              Adding a town here does <strong>not</strong> load its addresses. It
              only means the name is available to pick when creating a campaign,
              so two people setting up campaigns in the same town spell it the
              same way. Load the doors afterwards from{" "}
              <Link href="/addresses/import" className="underline">
                Import addresses
              </Link>
              .
            </p>
            <Note tone="warn">
              Expect fewer than 444. The file only covers municipalities that
              publish open address data, so towns that publish none will be
              missing — add those by hand when you set their campaign up.
            </Note>
          </Card>
        </div>
      </div>
    </>
  );
}
