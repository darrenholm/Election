import Link from "next/link";
import { db } from "@/lib/db";
import { OCCUPYING_STATUSES, SHIFT_TYPES, SHIFT_TYPE_OPTIONS, label } from "@/lib/enums";
import { formatDate, formatTime, toDateTimeInput } from "@/lib/dates";
import { createShift } from "@/app/actions/volunteers";
import { Badge, Card, EmptyState, Field, PageHeader, Select, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show = "upcoming" } = await searchParams;
  const past = show === "past";
  const now = new Date();

  const [shifts, events, upcomingCount] = await Promise.all([
    db.shift.findMany({
      where: past ? { startsAt: { lt: now } } : { startsAt: { gte: now } },
      include: { assignments: { include: { volunteer: true } }, event: true },
      orderBy: { startsAt: past ? "desc" : "asc" },
      take: 100,
    }),
    db.event.findMany({ orderBy: { startsAt: "asc" }, select: { id: true, name: true } }),
    db.shift.count({ where: { startsAt: { gte: now } } }),
  ]);

  const days = groupByDay(shifts);
  const seats = shifts.reduce((n, s) => n + s.capacity, 0);
  const filled = shifts.reduce(
    (n, s) => n + s.assignments.filter((a) => OCCUPYING_STATUSES.includes(a.status as never)).length,
    0,
  );

  // Default the new-shift form to the next Saturday at 10am — the single most
  // common canvass slot, and one fewer thing to type.
  const defaultStart = nextSaturdayMorning(now);

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle={`${upcomingCount} upcoming`}
        actions={
          <Link
            href={past ? "/shifts" : "/shifts?show=past"}
            className="btn-secondary"
          >
            {past ? "Show upcoming" : "Show past"}
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label={past ? "Past shifts" : "Upcoming shifts"} value={shifts.length} />
        <StatTile label="Seats" value={seats || "—"} />
        <StatTile label="Filled" value={filled} tone={seats > 0 && filled < seats ? "warn" : "good"} />
        <StatTile
          label="Unfilled seats"
          value={Math.max(0, seats - filled)}
          tone={seats - filled > 0 ? "warn" : "good"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {days.length === 0 ? (
            <Card>
              <EmptyState
                title={past ? "No past shifts" : "Nothing scheduled"}
                hint="Put your canvass blocks and phone banks on the calendar so volunteers have something to sign up for."
              />
            </Card>
          ) : (
            days.map((day) => (
              <Card key={day.key} title={formatDate(day.date)}>
                <ul className="divide-y divide-line">
                  {day.shifts.map((shift) => {
                    const signedUp = shift.assignments.filter((a) =>
                      OCCUPYING_STATUSES.includes(a.status as never),
                    );
                    const short = shift.capacity > 0 && signedUp.length < shift.capacity;
                    return (
                      <li key={shift.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/shifts/${shift.id}`}
                              className="font-medium hover:underline"
                            >
                              {shift.title}
                            </Link>
                            <p className="text-xs text-muted">
                              {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
                              {shift.location ? ` · ${shift.location}` : ""}
                              {shift.event ? ` · ${shift.event.name}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{label(SHIFT_TYPES, shift.type)}</Badge>
                            <Badge tone={short ? "warn" : "good"}>
                              {shift.capacity > 0
                                ? `${signedUp.length}/${shift.capacity}`
                                : `${signedUp.length} signed up`}
                            </Badge>
                          </div>
                        </div>
                        {signedUp.length > 0 ? (
                          <p className="mt-1.5 text-xs text-muted">
                            {signedUp
                              .map((a) => `${a.volunteer.firstName} ${a.volunteer.lastName}`.trim())
                              .join(", ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          )}
        </div>

        <Card title="Schedule a shift">
          <form action={createShift} className="space-y-4">
            <Field label="Title">
              <input name="title" className="field" placeholder="Saturday canvass — Ward 3" required />
            </Field>
            <Field label="Type">
              <Select name="type" options={SHIFT_TYPE_OPTIONS} defaultValue="CANVASS" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeInput(defaultStart)}
                  className="field"
                  required
                />
              </Field>
              <Field label="Ends" hint="Blank means two hours.">
                <input name="endsAt" type="datetime-local" className="field" />
              </Field>
            </div>
            <Field label="Meeting point">
              <input name="location" className="field" placeholder="Campaign office, 12 Kent St W" />
            </Field>
            <Field label="Volunteers needed" hint="0 means no cap.">
              <input name="capacity" type="number" min={0} defaultValue={4} className="field" />
            </Field>
            {events.length > 0 ? (
              <Field label="Part of an event">
                <Select
                  name="eventId"
                  options={events.map((e) => ({ value: e.id, label: e.name }))}
                  includeBlank
                  blankLabel="Not tied to an event"
                />
              </Field>
            ) : null}
            <Field label="Notes">
              <textarea name="notes" rows={2} className="field" placeholder="Bring clipboards and water." />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Create shift
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

type ShiftLike = { id: string; startsAt: Date };

function groupByDay<T extends ShiftLike>(shifts: T[]) {
  const days = new Map<string, { key: string; date: Date; shifts: T[] }>();
  for (const shift of shifts) {
    const d = shift.startsAt;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const entry = days.get(key);
    if (entry) entry.shifts.push(shift);
    else days.set(key, { key, date: d, shifts: [shift] });
  }
  return Array.from(days.values());
}

function nextSaturdayMorning(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d;
}
