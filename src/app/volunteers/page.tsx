import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import {
  OCCUPYING_STATUSES,
  VOLUNTEER_ROLES,
  VOLUNTEER_ROLE_OPTIONS,
  VOLUNTEER_STATUSES,
  VOLUNTEER_STATUS_OPTIONS,
  label,
  splitList,
} from "@/lib/enums";
import { createVolunteer, recruitVoter } from "@/app/actions/volunteers";
import { Badge, Card, Check, EmptyState, Field, PageHeader, Select, StatTile, Table, Td, Th } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const { q = "", role = "", status = "" } = await searchParams;

  const where: Prisma.VolunteerWhereInput = {};
  if (q.trim()) {
    where.OR = [
      { firstName: { contains: q.trim() } },
      { lastName: { contains: q.trim() } },
      { email: { contains: q.trim() } },
      { phone: { contains: q.trim() } },
    ];
  }
  if (role) where.roles = { contains: role };
  if (status) where.status = status;

  const now = new Date();

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;
  where.campaignId = campaignId;

  const [volunteers, counts, recruits] = await Promise.all([
    db.volunteer.findMany({
      where,
      include: {
        assignments: { include: { shift: true } },
        _count: { select: { contacts: true } },
      },
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    db.volunteer.groupBy({ by: ["status"], where: { campaignId }, _count: true }),
    // Voters who said yes at the door but are not on this campaign's roster yet.
    db.voter.findMany({
      where: {
        campaignStates: { some: { campaignId, wantsToVolunteer: true } },
        volunteers: { none: { campaignId } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        campaignStates: { where: { campaignId }, select: { phone: true, email: true } },
      },
    }),
  ]);

  const byStatus = new Map(counts.map((c) => [c.status, c._count]));
  const totalHours = volunteers.reduce(
    (sum, v) => sum + v.assignments.reduce((n, a) => n + (a.hoursLogged ?? 0), 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Volunteers"
        subtitle={`${volunteers.length} on the roster`}
        actions={
          <Link href="/shifts" className="btn-secondary">
            Shift schedule
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Active" value={byStatus.get("ACTIVE") ?? 0} tone="good" />
        <StatTile label="Prospects" value={byStatus.get("PROSPECT") ?? 0} />
        <StatTile label="Inactive" value={byStatus.get("INACTIVE") ?? 0} />
        <StatTile label="Hours logged" value={totalHours.toLocaleString("en-CA")} />
      </div>

      {recruits.length > 0 ? (
        <Card
          title="Said yes at the door"
          description="Voters who offered to help and are not on the roster yet."
          className="mb-6"
        >
          <ul className="divide-y divide-line">
            {recruits.map((voter) => {
              const recruit = recruitVoter.bind(null, voter.id);
              return (
                <li key={voter.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/voters/${voter.id}`} className="font-medium hover:underline">
                      {titleCase(voter.firstName)} {titleCase(voter.lastName)}
                    </Link>
                    <p className="text-xs text-muted">
                      {[voter.campaignStates[0]?.phone, voter.campaignStates[0]?.email]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </p>
                  </div>
                  <form action={recruit}>
                    <button type="submit" className="btn-secondary">
                      Add to roster
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Roster"
            actions={
              <form className="flex flex-wrap gap-2">
                <input name="q" defaultValue={q} placeholder="Search" className="field w-36" />
                <select name="role" defaultValue={role} className="field w-36">
                  <option value="">Any role</option>
                  {VOLUNTEER_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select name="status" defaultValue={status} className="field w-32">
                  <option value="">Any status</option>
                  {VOLUNTEER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary">
                  Filter
                </button>
              </form>
            }
          >
            {volunteers.length === 0 ? (
              <EmptyState
                title="Nobody on the roster yet"
                hint="Add your core team on the right, then recruit at the door as you canvass."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Roles</Th>
                    <Th>Contact</Th>
                    <Th>Upcoming</Th>
                    <Th>Hours</Th>
                  </tr>
                </thead>
                <tbody>
                  {volunteers.map((v) => {
                    const upcoming = v.assignments.filter(
                      (a) =>
                        a.shift.startsAt >= now &&
                        OCCUPYING_STATUSES.includes(a.status as never),
                    ).length;
                    const hours = v.assignments.reduce((n, a) => n + (a.hoursLogged ?? 0), 0);
                    return (
                      <tr key={v.id} className="hover:bg-raise">
                        <Td>
                          <Link href={`/volunteers/${v.id}`} className="font-medium hover:underline">
                            {v.firstName} {v.lastName}
                          </Link>
                          <div className="mt-1">
                            <Badge tone={v.status === "ACTIVE" ? "good" : "neutral"}>
                              {label(VOLUNTEER_STATUSES, v.status)}
                            </Badge>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {splitList(v.roles).map((r) => (
                              <Badge key={r}>{label(VOLUNTEER_ROLES, r)}</Badge>
                            ))}
                            {v.hasVehicle ? <Badge tone="brand">Has a car</Badge> : null}
                          </div>
                        </Td>
                        <Td className="text-muted">
                          {v.phone ? <span className="block">{v.phone}</span> : null}
                          {v.email ? <span className="block truncate text-xs">{v.email}</span> : null}
                        </Td>
                        <Td className="tabular-nums">{upcoming || "—"}</Td>
                        <Td className="tabular-nums">{hours > 0 ? hours.toFixed(1) : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card title="Add a volunteer">
          <form action={createVolunteer} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <input name="firstName" className="field" required />
              </Field>
              <Field label="Last name">
                <input name="lastName" className="field" />
              </Field>
            </div>
            <Field label="Phone">
              <input name="phone" type="tel" className="field" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className="field" />
            </Field>
            <Field label="Status">
              <Select name="status" options={VOLUNTEER_STATUS_OPTIONS} defaultValue="ACTIVE" />
            </Field>
            <fieldset>
              <legend className="field-label">Roles</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {VOLUNTEER_ROLE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="roles"
                      value={o.value}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Availability" hint="Free text — e.g. weekday evenings, Saturday mornings.">
              <textarea name="availability" rows={2} className="field" />
            </Field>
            <Check name="hasVehicle" label="Has a vehicle" />
            <Field label="Notes">
              <textarea name="notes" rows={2} className="field" />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Add volunteer
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
