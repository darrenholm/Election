import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign, listCampaigns } from "@/lib/campaign";
import { OFFICES, OFFICE_OPTIONS, label } from "@/lib/enums";
import { formatDate, toDateInput } from "@/lib/dates";
import { nextOntarioVotingDay } from "@/lib/campaign";
import { archiveCampaign, setActiveCampaign } from "@/app/actions/campaigns";
import { NewCampaignForm } from "./new-campaign-form";
import { addToSlate, createSlate, deleteSlate, removeFromSlate, setSlateSharing } from "@/app/actions/slate";
import { getCurrentUser } from "@/lib/auth";
import { getSlates } from "@/lib/slate";
import { Badge, Card, Check, EmptyState, Field, Note, PageHeader, Select, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Every campaign in one place. A consultant running six candidates across two
 * municipalities works from here: pick whose campaign you are on, and the rest
 * of the app follows.
 */
export default async function CampaignsPage() {
  const [campaigns, active, municipalities, me] = await Promise.all([
    listCampaigns(),
    getActiveCampaign(),
    db.municipality.findMany({
      include: { _count: { select: { households: true, voters: true, campaigns: true } } },
      orderBy: { name: "asc" },
    }),
    getCurrentUser(),
  ]);

  // Slates are per municipality: candidates in different towns knock different
  // doors, so there is nothing to pool.
  const slatesByTown = await Promise.all(
    municipalities.map(async (m) => ({ municipality: m, slates: await getSlates(m.id) })),
  );

  // Harvesting the province leaves hundreds of towns on file, so this page
  // shows only the ones actually being worked in. The rest live on
  // /municipalities.
  const inUse = municipalities.filter((m) => m._count.campaigns > 0 || m._count.households > 0);

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

          {me?.isAdmin ? (
            <Card
              title="Slates"
              description="Candidates running together who agree to pool what they learn at the door."
            >
              <Note>
                Sharing is <strong>reciprocal and off by default</strong>: a
                campaign sees its slate-mates&apos; canvass notes only while it is
                sharing its own. Text-message consent and anything financial are
                never shared, whatever the slate agrees — consent is given to a
                named sender, and each candidate has their own contribution
                limits and their own Form 4.
              </Note>

              {slatesByTown.flatMap((t) => t.slates).length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No slates yet. Create one below if your candidates decide to
                  run together.
                </p>
              ) : (
                <ul className="mt-3 space-y-4">
                  {slatesByTown.flatMap((town) =>
                    town.slates.map((slate) => {
                      const remove = deleteSlate.bind(null, slate.id);
                      const inSlate = new Set(slate.members.map((m) => m.campaignId));
                      const candidates = campaigns.filter(
                        (c) => c.municipalityId === town.municipality.id && !inSlate.has(c.id),
                      );
                      return (
                        <li key={slate.id} className="rounded-lg border border-line p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                              {slate.name}{" "}
                              <span className="text-xs font-normal text-muted">
                                {town.municipality.name}
                              </span>
                            </p>
                            <form action={remove}>
                              <button type="submit" className="btn-ghost text-xs">
                                Delete slate
                              </button>
                            </form>
                          </div>

                          {slate.members.length === 0 ? (
                            <p className="mt-2 text-xs text-muted">No members yet.</p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {slate.members.map((member) => {
                                const toggle = setSlateSharing.bind(
                                  null,
                                  member.id,
                                  !member.sharesCanvassData,
                                );
                                const drop = removeFromSlate.bind(null, member.id);
                                return (
                                  <li
                                    key={member.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded bg-raise px-2.5 py-1.5 text-sm"
                                  >
                                    <span>
                                      {member.campaign.candidateName}{" "}
                                      {member.sharesCanvassData ? (
                                        <Badge tone="good">Sharing</Badge>
                                      ) : (
                                        <Badge>Not sharing</Badge>
                                      )}
                                    </span>
                                    <span className="flex gap-2">
                                      <form action={toggle}>
                                        <button type="submit" className="text-xs underline">
                                          {member.sharesCanvassData
                                            ? "Stop sharing"
                                            : "Start sharing"}
                                        </button>
                                      </form>
                                      <form action={drop}>
                                        <button type="submit" className="text-xs text-muted underline">
                                          Remove
                                        </button>
                                      </form>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {candidates.length > 0 ? (
                            <form action={addToSlate} className="mt-2 flex flex-wrap gap-2">
                              <input type="hidden" name="slateId" value={slate.id} />
                              <select name="campaignId" className="field w-56 text-xs" required>
                                <option value="">Add a candidate…</option>
                                {candidates.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.candidateName}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="btn-secondary text-xs">
                                Add
                              </button>
                            </form>
                          ) : null}
                        </li>
                      );
                    }),
                  )}
                </ul>
              )}

              {municipalities.length > 0 ? (
                <form action={createSlate} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  <input
                    name="name"
                    placeholder="Slate name"
                    className="field w-44 text-xs"
                    required
                  />
                  <select name="municipalityId" className="field w-56 text-xs" required>
                    {municipalities.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary text-xs">
                    Create slate
                  </button>
                </form>
              ) : null}
            </Card>
          ) : null}

          {inUse.length > 0 ? (
            <Card
              title="Municipalities"
              description="Doors and electors are loaded once and shared by every campaign in the town."
            >
              <ul className="divide-y divide-line">
                {inUse.map((m) => (
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
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Link href="/addresses/import" className="underline">
                  Load a municipality&apos;s address file
                </Link>
                <Link href="/municipalities" className="underline">
                  All {municipalities.length.toLocaleString("en-CA")} municipalities
                </Link>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Add a campaign">
            <NewCampaignForm>
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
                hint="Required unless you picked an existing municipality above."
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

            </NewCampaignForm>
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
