import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EVENT_TYPES, EVENT_TYPE_OPTIONS, OCCUPYING_STATUSES, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime, toDateTimeInput } from "@/lib/dates";
import { deleteEvent, updateEvent } from "@/app/actions/events";
import { Badge, Card, Check, EmptyState, Field, Note, PageHeader, Select, StatTile, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      contributions: { include: { contributor: true }, orderBy: { receivedAt: "desc" } },
      expenses: { orderBy: { incurredAt: "desc" } },
      shifts: { include: { assignments: { include: { volunteer: true } } }, orderBy: { startsAt: "asc" } },
    },
  });

  if (!event) notFound();

  const live = event.contributions.filter((c) => c.returnedAt === null);
  const income = live.reduce((n, c) => n + c.amountCents, 0);
  const spend = event.expenses.reduce((n, e) => n + e.amountCents, 0);
  const signups = event.shifts.flatMap((s) =>
    s.assignments.filter((a) => OCCUPYING_STATUSES.includes(a.status as never)),
  );

  const save = updateEvent.bind(null, event.id);
  const remove = deleteEvent.bind(null, event.id);

  return (
    <>
      <PageHeader
        title={event.name}
        subtitle={
          <>
            {formatDateTime(event.startsAt)}
            {event.location ? ` · ${event.location}` : ""}
            {event.addressLine ? ` · ${event.addressLine}` : ""}
          </>
        }
        actions={
          <Link href="/events" className="btn-secondary">
            All events
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="brand">{label(EVENT_TYPES, event.type)}</Badge>
        {event.isFundraiser ? <Badge tone="good">Fundraising function</Badge> : null}
        {event.ticketPriceCents ? (
          <Badge>{formatCents(event.ticketPriceCents)} a ticket</Badge>
        ) : null}
      </div>

      {event.isFundraiser ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Raised" value={formatCents(income)} tone="good" />
          <StatTile label="Costs" value={formatCents(spend)} />
          <StatTile
            label="Net"
            value={formatCents(income - spend)}
            tone={income - spend < 0 ? "bad" : "good"}
          />
          <StatTile label="Contributions" value={live.length} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {event.description ? (
            <Card title="Details">
              <p className="whitespace-pre-wrap text-sm">{event.description}</p>
            </Card>
          ) : null}

          <Card title="Shifts" description={`${signups.length} volunteers signed up`}>
            {event.shifts.length === 0 ? (
              <EmptyState
                title="No shifts attached"
                hint="Create a shift on the schedule and tie it to this event."
                action={
                  <Link href="/shifts" className="btn-primary">
                    Schedule a shift
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {event.shifts.map((shift) => (
                  <li key={shift.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link href={`/shifts/${shift.id}`} className="font-medium hover:underline">
                      {shift.title}
                    </Link>
                    <span className="text-xs text-muted">
                      {formatDateTime(shift.startsAt)} ·{" "}
                      {shift.assignments.length} signed up
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {event.isFundraiser ? (
            <>
              <Card title="Contributions received here">
                {live.length === 0 ? (
                  <EmptyState
                    title="Nothing recorded against this event"
                    hint="Pick the event when you record a contribution and it appears here — and on Schedule 2 of the Form 4 worksheet."
                  />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Contributor</Th>
                        <Th className="text-right">Amount</Th>
                        <Th>Received</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.map((c) => (
                        <tr key={c.id}>
                          <Td>
                            {c.contributor ? (
                              <Link
                                href={`/finance/contributors/${c.contributorId}`}
                                className="hover:underline"
                              >
                                {c.contributor.firstName} {c.contributor.lastName}
                              </Link>
                            ) : (
                              <span className="text-muted">Anonymous</span>
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">{formatCents(c.amountCents)}</Td>
                          <Td className="text-muted">{formatDate(c.receivedAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              <Card title="Costs of holding the event">
                {event.expenses.length === 0 ? (
                  <EmptyState title="No costs recorded" />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Description</Th>
                        <Th className="text-right">Amount</Th>
                        <Th>Incurred</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.expenses.map((e) => (
                        <tr key={e.id}>
                          <Td>{e.description}</Td>
                          <Td className="text-right tabular-nums">{formatCents(e.amountCents)}</Td>
                          <Td className="text-muted">{formatDate(e.incurredAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <div className="mt-4">
                  <Note>
                    The cost of holding a fundraising function is excluded from
                    the general spending limit but still has to be reported.
                    Record it under &ldquo;Cost of fundraising events and
                    activities&rdquo; on the expenses page.
                  </Note>
                </div>
              </Card>
            </>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Edit event">
            <form action={save} className="space-y-3">
              <Field label="Name">
                <input name="name" defaultValue={event.name} className="field" required />
              </Field>
              <Field label="Type">
                <Select name="type" options={EVENT_TYPE_OPTIONS} defaultValue={event.type} />
              </Field>
              <Field label="Starts">
                <input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeInput(event.startsAt)}
                  className="field"
                  required
                />
              </Field>
              <Field label="Ends">
                <input
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={toDateTimeInput(event.endsAt)}
                  className="field"
                />
              </Field>
              <Field label="Venue">
                <input name="location" defaultValue={event.location} className="field" />
              </Field>
              <Field label="Address">
                <input name="addressLine" defaultValue={event.addressLine} className="field" />
              </Field>
              <Check
                name="isFundraiser"
                label="This is a fundraising function"
                defaultChecked={event.isFundraiser}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ticket price">
                  <input
                    name="ticketPrice"
                    inputMode="decimal"
                    defaultValue={
                      event.ticketPriceCents != null
                        ? (event.ticketPriceCents / 100).toFixed(2)
                        : ""
                    }
                    className="field"
                  />
                </Field>
                <Field label="Expected">
                  <input
                    name="expectedAttendance"
                    type="number"
                    min={0}
                    defaultValue={event.expectedAttendance ?? ""}
                    className="field"
                  />
                </Field>
              </div>
              <Field label="Actual attendance">
                <input
                  name="actualAttendance"
                  type="number"
                  min={0}
                  defaultValue={event.actualAttendance ?? ""}
                  className="field"
                />
              </Field>
              <Field label="Description">
                <textarea name="description" rows={3} defaultValue={event.description} className="field" />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Save event
              </button>
            </form>
            <form action={remove} className="mt-4 border-t border-line pt-4">
              <button type="submit" className="btn-danger">
                Delete event
              </button>
              <p className="mt-2 text-xs text-muted">
                Contributions and expenses recorded against this event stay on
                the books; they simply stop being linked to it.
              </p>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
