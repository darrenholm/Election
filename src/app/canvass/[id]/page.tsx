import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { stateOf } from "@/lib/voter-state";
import { TURF_STATUS_OPTIONS } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import {
  addStreetToTurf,
  deleteTurf,
  removeHouseholdFromTurf,
  updateTurf,
} from "@/app/actions/voters";
import { Badge, Card, EmptyState, Field, Note, PageHeader, Select } from "@/components/ui";
import { SupportBadge, titleCase } from "@/components/voter";
import { ContactForm } from "@/components/contact-form";
import { NobodyHome } from "@/components/door-actions";

export const dynamic = "force-dynamic";

export default async function TurfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await getActiveCampaign();
  if (!campaign) notFound();
  const campaignId = campaign.id;

  const [turfRow, volunteers] = await Promise.all([
    db.turf.findFirst({
      where: { id, campaignId },
      include: {
        assignedTo: true,
        households: {
          include: {
            household: {
              include: {
                voters: {
                  include: {
                    campaignStates: { where: { campaignId } },
                    contacts: {
                      where: { campaignId },
                      orderBy: { occurredAt: "desc" },
                      take: 1,
                    },
                  },
                  orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
                },
              },
            },
          },
        },
      },
    }),
    db.volunteer.findMany({
      where: { campaignId, status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  if (!turfRow) notFound();
  // Flatten the join rows so the rest of the page works with households.
  const turf = { ...turfRow, households: turfRow.households.map((th) => th.household) };

  // Walk order: down one street at a time, in civic-number order. Sorting in
  // the app rather than SQL because street numbers are text ("12", "12A", "104")
  // and only a numeric-aware comparison puts them in the order you actually walk.
  const streets = groupByStreet(turf.households);

  const allVoters = turf.households.flatMap((h) => h.voters);
  const identified = allVoters.filter(
    (v) => stateOf(v.campaignStates[0]).supportLevel !== null,
  ).length;
  const knocked = turf.households.filter((h) =>
    h.voters.some((v) => v.contacts.length > 0),
  ).length;

  const saveTurf = updateTurf.bind(null, turf.id);
  const removeTurf = deleteTurf.bind(null, turf.id);
  const addStreet = addStreetToTurf.bind(null, turf.id);

  return (
    <>
      <PageHeader
        title={turf.name}
        subtitle={
          <>
            {turf.households.length} doors · {allVoters.length} voters ·{" "}
            {identified} identified
            {turf.assignedTo
              ? ` · ${turf.assignedTo.firstName} ${turf.assignedTo.lastName}`.trimEnd()
              : " · unassigned"}
          </>
        }
        actions={
          <>
            <Link href="/canvass" className="btn-secondary">
              All turf
            </Link>
            <a href="#walk-list" className="btn-primary">
              Walk list
            </a>
          </>
        }
      />

      {turf.description ? (
        <div className="mb-6">
          <Note>{turf.description}</Note>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Progress label="Doors knocked" value={knocked} total={turf.households.length} />
        <Progress label="Voters identified" value={identified} total={allVoters.length} />
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Streets</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{streets.length}</p>
        </div>
      </div>

      <section id="walk-list" className="space-y-6">
        {streets.length === 0 ? (
          <Card>
            <EmptyState
              title="No doors in this turf yet"
              hint="Add a street below and every household on it joins the walk list."
            />
          </Card>
        ) : (
          streets.map((street) => (
            <Card key={street.name} title={titleCase(street.name)} description={`${street.households.length} doors`}>
              <ul className="divide-y divide-line">
                {street.households.map((household) => {
                  const removeDoor = removeHouseholdFromTurf.bind(null, turf.id, household.id);
                  return (
                    <li key={household.id} className="py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">
                          {household.streetNumber}
                          {household.unit ? ` — Unit ${household.unit}` : ""}{" "}
                          <span className="font-normal text-muted">
                            {titleCase(household.streetName)}
                          </span>
                        </p>
                        {/* Turf management, not canvassing — kept reachable but
                            visually out of the way of the walk list itself. */}
                        <form action={removeDoor} className="no-print">
                          <button
                            type="submit"
                            className="text-xs text-muted underline decoration-dotted hover:text-ink"
                          >
                            Remove from turf
                          </button>
                        </form>
                      </div>

                      {household.voters.length === 0 ? (
                        <p className="text-sm text-muted">Nobody on file at this address.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {household.voters.map((voter) => {
                            const last = voter.contacts[0];
                            const state = stateOf(voter.campaignStates[0]);
                            return (
                              <li key={voter.id}>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <Link
                                    href={`/voters/${voter.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    {titleCase(voter.firstName)} {titleCase(voter.lastName)}
                                  </Link>
                                  <SupportBadge level={state.supportLevel} />
                                  {state.doNotContact ? (
                                    <Badge tone="bad">Do not knock</Badge>
                                  ) : null}
                                  {state.wantsSign ? <Badge tone="brand">Sign</Badge> : null}
                                  {last ? (
                                    <span className="text-xs text-muted">
                                      last contacted {formatDate(last.occurredAt)}
                                    </span>
                                  ) : null}
                                </div>

                                {!state.doNotContact ? (
                                  <details className="no-print mt-1.5">
                                    <summary className="cursor-pointer text-xs font-medium text-brand">
                                      Log a contact
                                    </summary>
                                    <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
                                      <ContactForm
                                        voterId={voter.id}
                                        volunteers={volunteers}
                                        defaultVolunteerId={turf.assignedToId}
                                        knownPhone={voter.phone}
                                        knownEmail={voter.email}
                                        smsConsent={state.smsConsent}
                                        compact
                                      />
                                    </div>
                                  </details>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Door-level actions, which belong to the address rather
                          than to anyone living at it. Nobody home is the
                          commonest outcome of a knock and is one tap. The form
                          below it is for whoever answers who is not on the
                          list — an adult child, a new partner, a tenant, or
                          everybody at the door before the clerk's list has
                          arrived. */}
                      <div className="no-print mt-2 flex flex-wrap items-center gap-3">
                        <NobodyHome
                          householdId={household.id}
                          defaultVolunteerId={turf.assignedToId}
                        />
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-brand">
                            {household.voters.length === 0
                              ? "Someone answered"
                              : "Someone else lives here"}
                          </summary>
                          <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
                            <ContactForm
                              householdId={household.id}
                              askForName
                              volunteers={volunteers}
                              defaultVolunteerId={turf.assignedToId}
                              compact
                            />
                          </div>
                        </details>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}
      </section>

      <div className="no-print mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Turf settings">
          <form action={saveTurf} className="space-y-4">
            <Field label="Name">
              <input name="name" defaultValue={turf.name} className="field" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assigned to">
                <Select
                  name="assignedToId"
                  options={volunteers.map((v) => ({
                    value: v.id,
                    label: `${v.firstName} ${v.lastName}`.trim(),
                  }))}
                  defaultValue={turf.assignedToId ?? ""}
                  includeBlank
                  blankLabel="Unassigned"
                />
              </Field>
              <Field label="Status">
                <Select
                  name="status"
                  options={TURF_STATUS_OPTIONS}
                  defaultValue={turf.status}
                />
              </Field>
            </div>
            {campaign.municipality.usesWards ? (
              <Field label="Ward">
                <input name="ward" defaultValue={turf.ward} className="field" />
              </Field>
            ) : null}
            <Field label="Notes for the canvasser">
              <textarea name="description" rows={3} defaultValue={turf.description} className="field" />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <button type="submit" className="btn-primary">
                Save turf
              </button>
            </div>
          </form>
          <form action={removeTurf} className="mt-4 border-t border-line pt-4">
            <button type="submit" className="btn-danger">
              Delete turf
            </button>
            <p className="mt-2 text-xs text-muted">
              Households go back to the unassigned pool; no voter data is lost.
            </p>
          </form>
        </Card>

        <Card title="Add a street">
          <form action={addStreet} className="space-y-4">
            <Field
              label="Street name"
              hint="Every household on this street joins the turf. Spelling is matched loosely."
            >
              <input name="street" className="field" placeholder="Kent St W" required />
            </Field>
            <button type="submit" className="btn-primary">
              Add street to turf
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value.toLocaleString("en-CA")}
        <span className="text-base font-normal text-muted"> / {total.toLocaleString("en-CA")}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raise">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type HouseholdWithVoters = {
  id: string;
  streetName: string;
  streetNumber: string;
  unit: string;
  voters: unknown[];
};

function groupByStreet<T extends HouseholdWithVoters>(households: T[]) {
  const byStreet = new Map<string, T[]>();
  for (const household of households) {
    const list = byStreet.get(household.streetName);
    if (list) list.push(household);
    else byStreet.set(household.streetName, [household]);
  }

  return Array.from(byStreet.entries())
    .map(([name, list]) => ({
      name,
      households: list.sort(byCivicNumber),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function byCivicNumber(a: HouseholdWithVoters, b: HouseholdWithVoters): number {
  const na = parseInt(a.streetNumber, 10);
  const nb = parseInt(b.streetNumber, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) {
    return a.streetNumber.localeCompare(b.streetNumber);
  }
  if (na !== nb) return na - nb;
  // Same civic number: 12A before 12B, then unit order within a building.
  return (
    a.streetNumber.localeCompare(b.streetNumber) || a.unit.localeCompare(b.unit, undefined, { numeric: true })
  );
}
