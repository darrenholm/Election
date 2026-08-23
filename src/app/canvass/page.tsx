import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { redirect } from "next/navigation";
import { TURF_STATUSES, label } from "@/lib/enums";
import { formatDateTime } from "@/lib/dates";
import { createTurf } from "@/app/actions/voters";
import { Badge, Card, EmptyState, Field, PageHeader, Select, StatTile } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

export default async function CanvassPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const [turfs, volunteers, unassignedStreets, recentContacts, weekStats, openFollowUps] = await Promise.all([
    db.turf.findMany({
      where: { campaignId },
      include: {
        assignedTo: true,
        households: {
          include: {
            household: {
              include: {
                voters: {
                  select: { campaignStates: { where: { campaignId }, select: { supportLevel: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.volunteer.findMany({
      where: { campaignId, status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    // Streets with no door in any of THIS campaign's turf.
    db.household.findMany({
      where: {
        municipalityId: campaign.municipalityId,
        NOT: { streetName: "" },
        turfHouseholds: { none: { turf: { campaignId } } },
      },
      distinct: ["streetName"],
      select: { streetName: true },
      orderBy: { streetName: "asc" },
      take: 60,
    }),
    db.contactAttempt.findMany({
      where: { campaignId },
      include: { voter: true, volunteer: true },
      orderBy: { occurredAt: "desc" },
      take: 12,
    }),
    db.contactAttempt.groupBy({
      by: ["result"],
      where: { campaignId, occurredAt: { gte: weekAgo } },
      _count: true,
    }),
    db.contactAttempt.count({
      where: { campaignId, followUpNeeded: true, followUpDoneAt: null },
    }),
  ]);

  const weekTotal = weekStats.reduce((n, r) => n + r._count, 0);
  const weekSpoke = weekStats.find((r) => r.result === "SPOKE")?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Canvassing"
        subtitle="Turf is a bundle of streets handed to one canvasser. Build it once, hand it out all campaign."
        actions={
          <Link href="/canvass/follow-ups" className="btn-secondary">
            Follow-ups{openFollowUps > 0 ? ` (${openFollowUps})` : ""}
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Turfs" value={turfs.length} />
        <StatTile
          label="Doors in turf"
          value={turfs.reduce((n, t) => n + t.households.length, 0).toLocaleString("en-CA")}
        />
        <StatTile label="Contacts this week" value={weekTotal.toLocaleString("en-CA")} />
        <StatTile
          label="Conversation rate"
          value={weekTotal > 0 ? `${((weekSpoke / weekTotal) * 100).toFixed(0)}%` : "—"}
          hint="Spoke with voter, of all attempts"
          tone="good"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Turf">
            {turfs.length === 0 ? (
              <EmptyState
                title="No turf built yet"
                hint="Create your first turf from the streets on the right — a good walk list is 60 to 100 doors, about two hours of canvassing."
              />
            ) : (
              <ul className="divide-y divide-line">
                {turfs.map((turf) => {
                  const doors = turf.households.length;
                  const voters = turf.households.flatMap((th) => th.household.voters);
                  const identified = voters.filter(
                    (v) => (v.campaignStates[0]?.supportLevel ?? null) !== null,
                  ).length;
                  const pct = voters.length > 0 ? (identified / voters.length) * 100 : 0;
                  return (
                    <li key={turf.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/canvass/${turf.id}`}
                            className="font-medium hover:underline"
                          >
                            {turf.name}
                          </Link>
                          <p className="text-xs text-muted">
                            {doors.toLocaleString("en-CA")} doors ·{" "}
                            {voters.length.toLocaleString("en-CA")} voters
                            {turf.assignedTo
                              ? ` · ${turf.assignedTo.firstName} ${turf.assignedTo.lastName}`.trimEnd()
                              : " · unassigned"}
                          </p>
                        </div>
                        <Badge
                          tone={
                            turf.status === "COMPLETE"
                              ? "good"
                              : turf.status === "IN_PROGRESS"
                                ? "brand"
                                : "neutral"
                          }
                        >
                          {label(TURF_STATUSES, turf.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raise">
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {identified.toLocaleString("en-CA")} of{" "}
                        {voters.length.toLocaleString("en-CA")} identified ({pct.toFixed(0)}%)
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Recent activity">
            {recentContacts.length === 0 ? (
              <EmptyState title="No contacts logged yet" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {recentContacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <Link href={`/voters/${c.voterId}`} className="font-medium hover:underline">
                        {titleCase(c.voter.firstName)} {titleCase(c.voter.lastName)}
                      </Link>
                      {c.volunteer ? (
                        <span className="text-muted">
                          {" "}
                          by {c.volunteer.firstName} {c.volunteer.lastName}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted">{formatDateTime(c.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Build a turf" description="Pick the streets it covers.">
            <form action={createTurf} className="space-y-4">
              <Field label="Turf name">
                <input name="name" className="field" placeholder="Ward 3 — north of Kent" required />
              </Field>
              <Field label="Assign to">
                <Select
                  name="assignedToId"
                  options={volunteers.map((v) => ({
                    value: v.id,
                    label: `${v.firstName} ${v.lastName}`.trim(),
                  }))}
                  includeBlank
                  blankLabel="Unassigned for now"
                />
              </Field>
              {campaign.municipality.usesWards ? (
                <Field label="Ward">
                  <input name="ward" className="field" />
                </Field>
              ) : null}
              <Field
                label="Streets"
                hint="One per line, or comma-separated. Every household on these streets joins the turf."
              >
                <textarea
                  name="streets"
                  rows={5}
                  className="field"
                  placeholder={"Kent St W\nWilliam St N\nLindsay St"}
                />
              </Field>
              <Field label="Notes for the canvasser">
                <textarea name="description" rows={2} className="field" />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Create turf
              </button>
            </form>
          </Card>

          <Card
            title="Streets not yet in turf"
            description={`${unassignedStreets.length} street${unassignedStreets.length === 1 ? "" : "s"}`}
          >
            {unassignedStreets.length === 0 ? (
              <p className="text-sm text-muted">
                Every street with an address on file belongs to a turf.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {unassignedStreets.map((s) => (
                  <li key={s.streetName}>
                    <Link
                      href={`/voters?street=${encodeURIComponent(s.streetName)}`}
                      className="text-muted hover:text-ink hover:underline"
                    >
                      {titleCase(s.streetName)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
