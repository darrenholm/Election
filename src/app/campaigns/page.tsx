import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign, listCampaigns } from "@/lib/campaign";
import { OFFICES, OFFICE_OPTIONS, label } from "@/lib/enums";
import { formatDate, toDateInput } from "@/lib/dates";
import { nextOntarioVotingDay } from "@/lib/campaign";
import { archiveCampaign, createCampaign, setActiveCampaign } from "@/app/actions/campaigns";
import { Badge, Card, Check, EmptyState, Field, Note, PageHeader, Select, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Every campaign in one place. A consultant running six candidates across two
 * municipalities works from here: pick whose campaign you are on, and the rest
 * of the app follows.
 */
export default async function CampaignsPage() {
  const [campaigns, active, municipalities] = await Promise.all([
    listCampaigns(),
    getActiveCampaign(),
    db.municipality.findMany({
      include: { _count: { select: { households: true, voters: true, campaigns: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const live = campaigns.filter((c) => c.isActive);
  const archived = campaigns.filter((c) => !c.isActive);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Each candidate has their own campaign. Doors and electors are shared by everyone running in the same municipality."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Active campaigns" value={live.length} />
        <StatTile label="Municipalities" value={municipalities.length} />
        <StatTile
          label="Doors on file"
          value={municipalities
            .reduce((n, m) => n + m._count.households, 0)
            .toLocaleString("en-CA")}
        />
        <StatTile
          label="Electors on file"
          value={municipalities.reduce((n, m) => n + m._count.voters, 0).toLocaleString("en-CA")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Your campaigns">
            {live.length === 0 ? (
              <EmptyState
                title="No campaigns yet"
                hint="Add your first candidate on the right. You can add the rest of the slate afterwards."
              />
            ) : (
              <ul className="divide-y divide-line">
                {live.map((campaign) => {
                  const isActive = active?.id === campaign.id;
                  const activate = setActiveCampaign.bind(null, campaign.id);
                  const archive = archiveCampaign.bind(null, campaign.id, true);
                  return (
                    <li key={campaign.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {campaign.candidateName}
                            {isActive ? (
                              <Badge tone="brand" className="ml-2">
                                Working on this
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-sm text-muted">
                            {label(OFFICES, campaign.office)} · {campaign.municipality.name}
                            {campaign.ward ? ` · ${campaign.ward}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            Voting day {formatDate(campaign.votingDay)} ·{" "}
                            {campaign._count.contacts.toLocaleString("en-CA")} contacts ·{" "}
                            {campaign._count.volunteers} volunteers ·{" "}
                            {campaign._count.signRequests} signs
                          </p>
                          {campaign.electorCount === 0 ? (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              No elector count set — spending limits cannot be calculated.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {!isActive ? (
                            <form action={activate}>
                              <button type="submit" className="btn-primary">
                                Switch to this
                              </button>
                            </form>
                          ) : (
                            <Link href="/settings" className="btn-secondary">
                              Settings
                            </Link>
                          )}
                          <form action={archive}>
                            <button type="submit" className="btn-ghost text-xs">
                              Archive
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {archived.length > 0 ? (
            <Card title="Archived" description="Kept readable — a filed Form 4 has to stand up for years.">
              <ul className="divide-y divide-line">
                {archived.map((campaign) => {
                  const restore = archiveCampaign.bind(null, campaign.id, false);
                  return (
                    <li key={campaign.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{campaign.candidateName}</p>
                        <p className="text-xs text-muted">
                          {label(OFFICES, campaign.office)} · {campaign.municipality.name}
                        </p>
                      </div>
                      <form action={restore}>
                        <button type="submit" className="btn-secondary">
                          Restore
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {municipalities.length > 0 ? (
            <Card
              title="Municipalities"
              description="Doors and electors are loaded once and shared by every campaign in the town."
            >
              <ul className="divide-y divide-line">
                {municipalities.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted">
                        {m.usesWards ? "Divided into wards" : "Elected at large"} ·{" "}
                        {m._count.campaigns} {m._count.campaigns === 1 ? "campaign" : "campaigns"}
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-muted">
                      {m._count.households.toLocaleString("en-CA")} doors ·{" "}
                      {m._count.voters.toLocaleString("en-CA")} electors
                    </p>
                  </li>
                ))}
              </ul>
              <Link href="/addresses/import" className="mt-3 inline-block text-sm underline">
                Load a municipality&apos;s address file
              </Link>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Add a campaign">
            <form action={createCampaign} className="space-y-3">
              <Field label="Candidate name">
                <input name="candidateName" className="field" placeholder="Rebecca Hergert" required />
              </Field>
              <Field label="Office">
                <Select name="office" options={OFFICE_OPTIONS} defaultValue="COUNCILLOR" />
              </Field>

              {municipalities.length > 0 ? (
                <Field
                  label="Municipality"
                  hint="Pick an existing one to share its doors and electors."
                >
                  <select name="municipalityId" defaultValue="" className="field">
                    <option value="">— new municipality —</option>
                    {municipalities.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Field
                label="New municipality name"
                hint="Only used when no existing municipality is selected."
              >
                <input name="municipalityName" className="field" placeholder="Municipality of West Grey" />
              </Field>

              <Check name="usesWards" label="This municipality is divided into wards" />

              <Field label="Ward" hint="Leave blank where council is elected at large.">
                <input name="ward" className="field" />
              </Field>

              <Field label="Voting day">
                <input
                  name="votingDay"
                  type="date"
                  defaultValue={toDateInput(nextOntarioVotingDay())}
                  className="field"
                />
              </Field>

              <Field
                label="Eligible electors"
                hint="From the clerk. Drives the spending limit — can be filled in later."
              >
                <input name="electorCount" type="number" min={0} className="field" />
              </Field>

              <button type="submit" className="btn-primary w-full">
                Create campaign
              </button>
            </form>
          </Card>

          <Card title="What is shared">
            <Note>
              Doors and electors belong to the <strong>municipality</strong>, so
              every candidate in the same town works from one address file and
              one voters&apos; list.
              <br />
              <br />
              Support levels, text consent, contacts, volunteers, money and signs
              belong to the <strong>campaign</strong>. A voter friendly to one
              candidate is not thereby friendly to another, and consent to be
              texted is given to a named sender.
            </Note>
          </Card>
        </div>
      </div>
    </>
  );
}
