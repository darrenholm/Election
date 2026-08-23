import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { formatDateTime } from "@/lib/dates";
import { resolveFollowUp } from "@/app/actions/follow-ups";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

/**
 * What was promised at a door, and whether anyone went back.
 *
 * The follow-up box on the canvass form is only worth ticking if the answer
 * surfaces somewhere a week later, in front of somebody who was not at that
 * door. That is this page.
 */
export default async function FollowUpsPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const [open, done] = await Promise.all([
    db.contactAttempt.findMany({
      where: { campaignId, followUpNeeded: true, followUpDoneAt: null },
      include: {
        voter: { include: { household: true } },
        volunteer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "asc" },
      take: 200,
    }),
    db.contactAttempt.findMany({
      where: { campaignId, followUpNeeded: true, followUpDoneAt: { not: null } },
      include: { voter: true },
      orderBy: { followUpDoneAt: "desc" },
      take: 25,
    }),
  ]);

  const now = new Date().getTime();
  const stale = open.filter((c) => now - c.occurredAt.getTime() > 7 * 86_400_000);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Doors where something was promised or left unresolved."
        actions={
          <Link href="/canvass" className="btn-secondary">
            Canvassing
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatTile label="Outstanding" value={open.length} tone={open.length > 0 ? "warn" : undefined} />
        <StatTile
          label="Over a week old"
          value={stale.length}
          tone={stale.length > 0 ? "bad" : undefined}
        />
        <StatTile label="Closed recently" value={done.length} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Outstanding">
            {open.length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                hint="Tick “Needs a follow-up” at a door and it lands here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {open.map((contact) => {
                  const voter = contact.voter;
                  const name = `${titleCase(voter.firstName)} ${titleCase(voter.lastName)}`.trim();
                  const address = voter.household
                    ? `${voter.household.streetNumber} ${titleCase(voter.household.streetName)}`.trim()
                    : "";
                  const age = Math.floor((now - contact.occurredAt.getTime()) / 86_400_000);
                  const close = resolveFollowUp.bind(null, contact.id, true);

                  return (
                    <li key={contact.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            <Link href={`/voters/${voter.id}`} className="hover:underline">
                              {name || "Unnamed elector"}
                            </Link>
                            {address ? <span className="text-muted"> · {address}</span> : null}
                          </p>
                          <p className="mt-0.5 text-sm">{contact.followUpReason}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatDateTime(contact.occurredAt)}
                            {contact.volunteer
                              ? ` · ${contact.volunteer.firstName} ${contact.volunteer.lastName}`.trimEnd()
                              : ""}
                            {voter.phone ? ` · ${voter.phone}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {age >= 7 ? <Badge tone="bad">{age} days</Badge> : null}
                          <form action={close}>
                            <button type="submit" className="btn-secondary text-xs">
                              Mark done
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
        </div>

        <div>
          <Card title="Recently closed">
            {done.length === 0 ? (
              <p className="text-sm text-muted">Nothing closed yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {done.map((contact) => {
                  const reopen = resolveFollowUp.bind(null, contact.id, false);
                  return (
                    <li key={contact.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate">
                          {`${titleCase(contact.voter.firstName)} ${titleCase(contact.voter.lastName)}`.trim() ||
                            "Unnamed elector"}
                        </p>
                        <p className="truncate text-xs text-muted">{contact.followUpReason}</p>
                      </div>
                      <form action={reopen}>
                        <button type="submit" className="shrink-0 text-xs text-muted underline">
                          Reopen
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
