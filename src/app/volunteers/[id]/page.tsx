import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  ASSIGNMENT_STATUSES,
  SHIFT_TYPES,
  VOLUNTEER_ROLE_OPTIONS,
  VOLUNTEER_STATUS_OPTIONS,
  label,
  splitList,
} from "@/lib/enums";
import { formatDate, formatDateTime } from "@/lib/dates";
import { deleteVolunteer, updateVolunteer } from "@/app/actions/volunteers";
import { Badge, Card, Check, EmptyState, Field, PageHeader, Select, StatTile, Table, Td, Th } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

export default async function VolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const volunteer = await db.volunteer.findUnique({
    where: { id },
    include: {
      voter: true,
      turfs: true,
      assignments: { include: { shift: true }, orderBy: { shift: { startsAt: "desc" } } },
      contacts: {
        include: { voter: true },
        orderBy: { occurredAt: "desc" },
        take: 15,
      },
      _count: { select: { contacts: true, signsInstalled: true } },
    },
  });

  if (!volunteer) notFound();

  const now = new Date();
  const upcoming = volunteer.assignments.filter((a) => a.shift.startsAt >= now);
  const past = volunteer.assignments.filter((a) => a.shift.startsAt < now);
  const hours = volunteer.assignments.reduce((n, a) => n + (a.hoursLogged ?? 0), 0);
  const roles = splitList(volunteer.roles);

  const save = updateVolunteer.bind(null, volunteer.id);
  const remove = deleteVolunteer.bind(null, volunteer.id);

  return (
    <>
      <PageHeader
        title={`${volunteer.firstName} ${volunteer.lastName}`.trim()}
        subtitle={[volunteer.phone, volunteer.email].filter(Boolean).join(" · ") || "No contact details on file"}
        actions={
          <Link href="/volunteers" className="btn-secondary">
            Roster
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Hours logged" value={hours > 0 ? hours.toFixed(1) : "0"} />
        <StatTile label="Upcoming shifts" value={upcoming.length} />
        <StatTile label="Voters contacted" value={volunteer._count.contacts} />
        <StatTile label="Signs installed" value={volunteer._count.signsInstalled} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Shifts">
            {volunteer.assignments.length === 0 ? (
              <EmptyState
                title="Not signed up for anything yet"
                hint="Assign them from a shift page."
                action={
                  <Link href="/shifts" className="btn-primary">
                    Open the schedule
                  </Link>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Shift</Th>
                    <Th>When</Th>
                    <Th>Status</Th>
                    <Th>Hours</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...upcoming, ...past].map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <Link href={`/shifts/${a.shiftId}`} className="font-medium hover:underline">
                          {a.shift.title}
                        </Link>
                        <span className="block text-xs text-muted">
                          {label(SHIFT_TYPES, a.shift.type)}
                        </span>
                      </Td>
                      <Td className="text-muted">{formatDateTime(a.shift.startsAt)}</Td>
                      <Td>
                        <Badge
                          tone={
                            a.status === "CHECKED_IN"
                              ? "good"
                              : a.status === "NO_SHOW"
                                ? "bad"
                                : "neutral"
                          }
                        >
                          {label(ASSIGNMENT_STATUSES, a.status)}
                        </Badge>
                      </Td>
                      <Td className="tabular-nums">{a.hoursLogged?.toFixed(1) ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {volunteer.contacts.length > 0 ? (
            <Card title="Recent canvassing" description={`${volunteer._count.contacts} contacts in total`}>
              <ul className="divide-y divide-line text-sm">
                {volunteer.contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link href={`/voters/${c.voterId}`} className="font-medium hover:underline">
                      {titleCase(c.voter.firstName)} {titleCase(c.voter.lastName)}
                    </Link>
                    <span className="text-xs text-muted">{formatDate(c.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Edit volunteer">
            <form action={save} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input name="firstName" defaultValue={volunteer.firstName} className="field" required />
                </Field>
                <Field label="Last name">
                  <input name="lastName" defaultValue={volunteer.lastName} className="field" />
                </Field>
                <Field label="Phone">
                  <input name="phone" type="tel" defaultValue={volunteer.phone} className="field" />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" defaultValue={volunteer.email} className="field" />
                </Field>
              </div>
              <Field label="Status">
                <Select
                  name="status"
                  options={VOLUNTEER_STATUS_OPTIONS}
                  defaultValue={volunteer.status}
                />
              </Field>
              <fieldset>
                <legend className="field-label">Roles</legend>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {VOLUNTEER_ROLE_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        name="roles"
                        value={o.value}
                        defaultChecked={roles.includes(o.value)}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Availability">
                <textarea name="availability" rows={2} defaultValue={volunteer.availability} className="field" />
              </Field>
              <Check name="hasVehicle" label="Has a vehicle" defaultChecked={volunteer.hasVehicle} />
              <Field label="Notes">
                <textarea name="notes" rows={3} defaultValue={volunteer.notes} className="field" />
              </Field>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Roles</dt>
                <dd className="text-right">
                  {roles.length > 0
                    ? roles
                        .map(
                          (r) =>
                            VOLUNTEER_ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r,
                        )
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Vehicle</dt>
                <dd>{volunteer.hasVehicle ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">On the voter file</dt>
                <dd>
                  {volunteer.voter ? (
                    <Link href={`/voters/${volunteer.voterId}`} className="underline">
                      View record
                    </Link>
                  ) : (
                    "Not linked"
                  )}
                </dd>
              </div>
            </dl>
            {volunteer.availability ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="field-label">Availability</p>
                <p className="whitespace-pre-wrap text-sm">{volunteer.availability}</p>
              </div>
            ) : null}
            {volunteer.notes ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="field-label">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{volunteer.notes}</p>
              </div>
            ) : null}
          </Card>

          {volunteer.turfs.length > 0 ? (
            <Card title="Turf assigned">
              <ul className="space-y-1 text-sm">
                {volunteer.turfs.map((t) => (
                  <li key={t.id}>
                    <Link href={`/canvass/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Remove">
            <p className="mb-3 text-sm text-muted">
              Marking someone inactive keeps their history. Deleting removes the
              volunteer record; contacts and installs they logged stay, but stop
              being attributed to anyone.
            </p>
            <form action={remove}>
              <button type="submit" className="btn-danger">
                Delete volunteer
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
