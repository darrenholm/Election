import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_OPTIONS,
  OCCUPYING_STATUSES,
  SHIFT_TYPES,
  SHIFT_TYPE_OPTIONS,
  label,
} from "@/lib/enums";
import { formatDateTime, formatTime, toDateTimeInput } from "@/lib/dates";
import {
  assignVolunteer,
  deleteShift,
  logHours,
  removeAssignment,
  setAssignmentStatus,
  updateShift,
} from "@/app/actions/volunteers";
import { Badge, Card, EmptyState, Field, Note, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [shift, volunteers, events] = await Promise.all([
    db.shift.findUnique({
      where: { id },
      include: {
        event: true,
        assignments: {
          include: { volunteer: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.volunteer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.event.findMany({ orderBy: { startsAt: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!shift) notFound();

  const taken = new Set(shift.assignments.map((a) => a.volunteerId));
  const available = volunteers.filter((v) => !taken.has(v.id));
  const occupying = shift.assignments.filter((a) =>
    OCCUPYING_STATUSES.includes(a.status as never),
  );
  const shortBy = Math.max(0, shift.capacity - occupying.length);

  const save = updateShift.bind(null, shift.id);
  const remove = deleteShift.bind(null, shift.id);
  const assign = assignVolunteer.bind(null, shift.id);

  return (
    <>
      <PageHeader
        title={shift.title}
        subtitle={
          <>
            {formatDateTime(shift.startsAt)} – {formatTime(shift.endsAt)}
            {shift.location ? ` · ${shift.location}` : ""}
          </>
        }
        actions={
          <Link href="/shifts" className="btn-secondary">
            All shifts
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{label(SHIFT_TYPES, shift.type)}</Badge>
        {shift.capacity > 0 ? (
          <Badge tone={shortBy > 0 ? "warn" : "good"}>
            {occupying.length} of {shift.capacity} filled
          </Badge>
        ) : (
          <Badge>{occupying.length} signed up</Badge>
        )}
        {shift.event ? <Badge>{shift.event.name}</Badge> : null}
      </div>

      {shift.notes ? (
        <div className="mb-6">
          <Note>{shift.notes}</Note>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Who is coming"
            description={
              shortBy > 0
                ? `Still ${shortBy} short — chase the roster.`
                : "This shift is covered."
            }
          >
            {shift.assignments.length === 0 ? (
              <EmptyState
                title="Nobody signed up yet"
                hint="Add volunteers from the panel on the right."
              />
            ) : (
              <ul className="divide-y divide-line">
                {shift.assignments.map((a) => {
                  const setStatus = setAssignmentStatus.bind(null, a.id);
                  const setHours = logHours.bind(null, a.id);
                  const drop = removeAssignment.bind(null, a.id);
                  return (
                    <li key={a.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Link
                            href={`/volunteers/${a.volunteerId}`}
                            className="font-medium hover:underline"
                          >
                            {a.volunteer.firstName} {a.volunteer.lastName}
                          </Link>
                          <p className="text-xs text-muted">
                            {[a.volunteer.phone, a.volunteer.email].filter(Boolean).join(" · ") ||
                              "No contact details"}
                          </p>
                        </div>
                        <Badge
                          tone={
                            a.status === "CHECKED_IN"
                              ? "good"
                              : a.status === "NO_SHOW"
                                ? "bad"
                                : a.status === "CANCELLED"
                                  ? "neutral"
                                  : "brand"
                          }
                        >
                          {label(ASSIGNMENT_STATUSES, a.status)}
                        </Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <form action={setStatus} className="flex items-end gap-2">
                          <label className="min-w-36">
                            <span className="field-label">Status</span>
                            <Select
                              name="status"
                              options={ASSIGNMENT_STATUS_OPTIONS}
                              defaultValue={a.status}
                            />
                          </label>
                          <button type="submit" className="btn-secondary">
                            Update
                          </button>
                        </form>

                        <form action={setHours} className="flex items-end gap-2">
                          <label className="w-24">
                            <span className="field-label">Hours</span>
                            <input
                              name="hours"
                              type="number"
                              step="0.5"
                              min="0"
                              defaultValue={a.hoursLogged ?? ""}
                              className="field"
                            />
                          </label>
                          <input type="hidden" name="notes" value={a.notes} />
                          <button type="submit" className="btn-secondary">
                            Log
                          </button>
                        </form>

                        <form action={drop}>
                          <button type="submit" className="btn-ghost text-xs">
                            Remove
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Edit shift">
            <form action={save} className="space-y-4">
              <Field label="Title">
                <input name="title" defaultValue={shift.title} className="field" required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <Select name="type" options={SHIFT_TYPE_OPTIONS} defaultValue={shift.type} />
                </Field>
                <Field label="Volunteers needed">
                  <input
                    name="capacity"
                    type="number"
                    min={0}
                    defaultValue={shift.capacity}
                    className="field"
                  />
                </Field>
                <Field label="Starts">
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={toDateTimeInput(shift.startsAt)}
                    className="field"
                    required
                  />
                </Field>
                <Field label="Ends">
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={toDateTimeInput(shift.endsAt)}
                    className="field"
                  />
                </Field>
              </div>
              <Field label="Meeting point">
                <input name="location" defaultValue={shift.location} className="field" />
              </Field>
              {events.length > 0 ? (
                <Field label="Part of an event">
                  <Select
                    name="eventId"
                    options={events.map((e) => ({ value: e.id, label: e.name }))}
                    defaultValue={shift.eventId ?? ""}
                    includeBlank
                    blankLabel="Not tied to an event"
                  />
                </Field>
              ) : null}
              <Field label="Notes">
                <textarea name="notes" rows={3} defaultValue={shift.notes} className="field" />
              </Field>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save shift
                </button>
              </div>
            </form>
            <form action={remove} className="mt-4 border-t border-line pt-4">
              <button type="submit" className="btn-danger">
                Delete shift
              </button>
            </form>
          </Card>
        </div>

        <Card title="Add a volunteer">
          {available.length === 0 ? (
            <p className="text-sm text-muted">
              Everyone on the roster is already on this shift.{" "}
              <Link href="/volunteers" className="underline">
                Add someone new
              </Link>
              .
            </p>
          ) : (
            <form action={assign} className="space-y-3">
              <Field label="Volunteer">
                <Select
                  name="volunteerId"
                  options={available.map((v) => ({
                    value: v.id,
                    label: `${v.firstName} ${v.lastName}`.trim() +
                      (v.hasVehicle ? " · car" : ""),
                  }))}
                  required
                />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Sign them up
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
