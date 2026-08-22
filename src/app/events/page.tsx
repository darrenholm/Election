import Link from "next/link";
import { db } from "@/lib/db";
import { EVENT_TYPES, EVENT_TYPE_OPTIONS, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDateTime, toDateTimeInput } from "@/lib/dates";
import { createEvent } from "@/app/actions/events";
import { Badge, Card, Check, EmptyState, Field, PageHeader, Select, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const now = new Date();

  const events = await db.event.findMany({
    include: {
      contributions: { where: { returnedAt: null } },
      expenses: true,
      shifts: { include: { assignments: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  const upcoming = events.filter((e) => e.startsAt >= now).reverse();
  const past = events.filter((e) => e.startsAt < now);

  const fundraisers = events.filter((e) => e.isFundraiser);
  const raised = fundraisers.reduce(
    (n, e) => n + e.contributions.reduce((m, c) => m + c.amountCents, 0),
    0,
  );
  const costs = fundraisers.reduce(
    (n, e) => n + e.expenses.reduce((m, x) => m + x.amountCents, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Events"
        subtitle={`${upcoming.length} upcoming · ${past.length} past`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Upcoming" value={upcoming.length} />
        <StatTile label="Fundraisers" value={fundraisers.length} />
        <StatTile label="Raised at events" value={formatCents(raised)} tone="good" />
        <StatTile
          label="Net of costs"
          value={formatCents(raised - costs)}
          tone={raised - costs < 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Upcoming">
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing on the calendar"
                hint="All-candidates meetings, meet-and-greets, fundraisers — put them here and you can attach shifts and money to them."
              />
            ) : (
              <EventList events={upcoming} />
            )}
          </Card>

          {past.length > 0 ? (
            <Card title="Past events">
              <EventList events={past} />
            </Card>
          ) : null}
        </div>

        <Card title="Add an event">
          <form action={createEvent} className="space-y-3">
            <Field label="Name">
              <input name="name" className="field" placeholder="Ward 3 all-candidates meeting" required />
            </Field>
            <Field label="Type">
              <Select name="type" options={EVENT_TYPE_OPTIONS} defaultValue="MEET_GREET" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeInput(new Date())}
                  className="field"
                  required
                />
              </Field>
              <Field label="Ends">
                <input name="endsAt" type="datetime-local" className="field" />
              </Field>
            </div>
            <Field label="Venue">
              <input name="location" className="field" placeholder="Legion Hall" />
            </Field>
            <Field label="Address">
              <input name="addressLine" className="field" />
            </Field>
            <Check name="isFundraiser" label="This is a fundraising function" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ticket price" hint="Blank if free.">
                <input name="ticketPrice" inputMode="decimal" placeholder="$0.00" className="field" />
              </Field>
              <Field label="Expected attendance">
                <input name="expectedAttendance" type="number" min={0} className="field" />
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" rows={3} className="field" />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Add event
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

type EventRow = {
  id: string;
  name: string;
  type: string;
  startsAt: Date;
  location: string;
  isFundraiser: boolean;
  contributions: { amountCents: number }[];
  expenses: { amountCents: number }[];
  shifts: { assignments: unknown[] }[];
};

function EventList({ events }: { events: EventRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {events.map((event) => {
        const income = event.contributions.reduce((n, c) => n + c.amountCents, 0);
        const spend = event.expenses.reduce((n, e) => n + e.amountCents, 0);
        const signups = event.shifts.reduce((n, s) => n + s.assignments.length, 0);
        return (
          <li key={event.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/events/${event.id}`} className="font-medium hover:underline">
                  {event.name}
                </Link>
                <p className="text-xs text-muted">
                  {formatDateTime(event.startsAt)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge>{label(EVENT_TYPES, event.type)}</Badge>
                {event.isFundraiser ? <Badge tone="brand">Fundraiser</Badge> : null}
                {signups > 0 ? <Badge tone="good">{signups} volunteers</Badge> : null}
              </div>
            </div>
            {event.isFundraiser ? (
              <p className="mt-1 text-xs text-muted">
                {formatCents(income)} raised · {formatCents(spend)} in costs ·{" "}
                {formatCents(income - spend)} net
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
