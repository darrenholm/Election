import Link from "next/link";
import { db } from "@/lib/db";
import { getCampaign } from "@/lib/campaign";
import {
  DEPLOYED_SIGN_STATUSES,
  PENDING_SIGN_STATUSES,
  SIGN_STATUSES,
  SIGN_STATUS_OPTIONS,
  SIGN_TYPES,
  SIGN_TYPE_OPTIONS,
  label,
} from "@/lib/enums";
import { formatDate, toDateInput } from "@/lib/dates";
import {
  createSignRequest,
  deleteSignRequest,
  setInventory,
  setSignStatus,
  updateSignRequest,
} from "@/app/actions/signs";
import { Badge, Card, Check, EmptyState, Field, PageHeader, Select, StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

/** The board's columns, in the order a sign actually moves through them. */
const COLUMNS: { status: string; tone: "neutral" | "brand" | "good" | "warn" }[] = [
  { status: "REQUESTED", tone: "neutral" },
  { status: "APPROVED", tone: "brand" },
  { status: "SCHEDULED", tone: "brand" },
  { status: "INSTALLED", tone: "good" },
  { status: "NEEDS_REPAIR", tone: "warn" },
];

export default async function SignsPage() {
  const [campaign, signs, inventory, volunteers, wantsSign] = await Promise.all([
    getCampaign(),
    db.signRequest.findMany({
      include: { installedBy: true, voter: true },
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    }),
    db.signInventory.findMany(),
    db.volunteer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.voter.count({ where: { wantsSign: true } }),
  ]);

  const owned = new Map(inventory.map((i) => [i.signType, i.quantityOwned]));

  const deployed = signs
    .filter((s) => DEPLOYED_SIGN_STATUSES.includes(s.status as never))
    .reduce((n, s) => n + s.quantity, 0);
  const pending = signs
    .filter((s) => PENDING_SIGN_STATUSES.includes(s.status as never))
    .reduce((n, s) => n + s.quantity, 0);
  const totalOwned = inventory.reduce((n, i) => n + i.quantityOwned, 0);

  // Deployed signs are out of the garage; pending ones are spoken for.
  const inGarage = totalOwned - deployed;
  const shortfall = pending - inGarage;

  return (
    <>
      <PageHeader
        title="Lawn signs"
        subtitle={`${deployed} up · ${pending} waiting on the crew`}
        actions={
          <Link href="/signs/run-sheet" className="btn-primary">
            Install run sheet
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Signs up" value={deployed} tone="good" />
        <StatTile label="Waiting on the crew" value={pending} tone={pending > 0 ? "warn" : "neutral"} />
        <StatTile
          label="Left in the garage"
          value={totalOwned > 0 ? inGarage : "—"}
          hint={totalOwned > 0 ? `${totalOwned} owned in total` : "Set your inventory below"}
          tone={totalOwned > 0 && shortfall > 0 ? "bad" : "neutral"}
        />
        <StatTile
          label="Promised at the door"
          value={wantsSign}
          hint="Voters flagged as wanting a sign"
          href="/voters?flag=signs"
        />
      </div>

      {totalOwned > 0 && shortfall > 0 ? (
        <div className="mb-6 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          You have promised {shortfall} more sign{shortfall === 1 ? "" : "s"} than you
          have on hand. Order more, or work through the queue before taking new
          requests.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {COLUMNS.map((column) => {
            const items = signs.filter((s) => s.status === column.status);
            if (items.length === 0 && column.status === "NEEDS_REPAIR") return null;
            return (
              <Card
                key={column.status}
                title={label(SIGN_STATUSES, column.status)}
                description={`${items.reduce((n, s) => n + s.quantity, 0)} signs across ${items.length} addresses`}
              >
                {items.length === 0 ? (
                  <p className="text-sm text-muted">Nothing here.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((sign) => {
                      const move = setSignStatus.bind(null, sign.id);
                      const save = updateSignRequest.bind(null, sign.id);
                      const remove = deleteSignRequest.bind(null, sign.id);
                      return (
                        <li key={sign.id} className="py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium">
                                {sign.requesterName || "Unnamed requester"}
                                {sign.quantity > 1 ? (
                                  <span className="text-muted"> × {sign.quantity}</span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted">
                                {[sign.addressLine, sign.city].filter(Boolean).join(", ") ||
                                  "No address"}
                                {campaign.usesWards && sign.ward ? ` · ${sign.ward}` : ""}
                              </p>
                              <p className="text-xs text-muted">
                                {[sign.phone, sign.email].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge tone={column.tone}>{label(SIGN_TYPES, sign.signType)}</Badge>
                              {!sign.permissionConfirmed ? (
                                <Badge tone="warn">Permission unconfirmed</Badge>
                              ) : null}
                              {sign.voterId ? (
                                <Link href={`/voters/${sign.voterId}`} className="text-xs underline">
                                  Voter
                                </Link>
                              ) : null}
                            </div>
                          </div>

                          {sign.installedAt ? (
                            <p className="mt-1 text-xs text-muted">
                              Installed {formatDate(sign.installedAt)}
                              {sign.installedBy
                                ? ` by ${sign.installedBy.firstName} ${sign.installedBy.lastName}`.trimEnd()
                                : ""}
                            </p>
                          ) : sign.scheduledFor ? (
                            <p className="mt-1 text-xs text-muted">
                              Scheduled for {formatDate(sign.scheduledFor)}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted">
                              Requested {formatDate(sign.requestedAt)}
                            </p>
                          )}

                          {sign.notes ? (
                            <p className="mt-1 text-sm">{sign.notes}</p>
                          ) : null}

                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <form action={move} className="flex flex-wrap items-end gap-2">
                              <label className="min-w-44">
                                <span className="field-label">Move to</span>
                                <Select
                                  name="status"
                                  options={SIGN_STATUS_OPTIONS}
                                  defaultValue={sign.status}
                                />
                              </label>
                              <label className="min-w-40">
                                <span className="field-label">Installed by</span>
                                <Select
                                  name="installedById"
                                  options={volunteers.map((v) => ({
                                    value: v.id,
                                    label: `${v.firstName} ${v.lastName}`.trim(),
                                  }))}
                                  defaultValue={sign.installedById ?? ""}
                                  includeBlank
                                  blankLabel="—"
                                />
                              </label>
                              <label className="w-40">
                                <span className="field-label">Scheduled for</span>
                                <input
                                  name="scheduledFor"
                                  type="date"
                                  defaultValue={toDateInput(sign.scheduledFor)}
                                  className="field"
                                />
                              </label>
                              <button type="submit" className="btn-secondary">
                                Update
                              </button>
                            </form>

                            <details>
                              <summary className="cursor-pointer text-xs text-muted">
                                Edit details
                              </summary>
                              <form action={save} className="mt-2 w-72 space-y-2">
                                <input
                                  name="requesterName"
                                  defaultValue={sign.requesterName}
                                  className="field text-xs"
                                />
                                <input
                                  name="addressLine"
                                  defaultValue={sign.addressLine}
                                  className="field text-xs"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    name="city"
                                    defaultValue={sign.city}
                                    placeholder="City"
                                    className="field text-xs"
                                  />
                                  <input
                                    name="postalCode"
                                    defaultValue={sign.postalCode}
                                    placeholder="Postal"
                                    className="field text-xs"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    name="phone"
                                    defaultValue={sign.phone}
                                    placeholder="Phone"
                                    className="field text-xs"
                                  />
                                  {campaign.usesWards ? (
                                    <input
                                      name="ward"
                                      defaultValue={sign.ward}
                                      placeholder="Ward"
                                      className="field text-xs"
                                    />
                                  ) : null}
                                </div>
                                <input
                                  name="email"
                                  defaultValue={sign.email}
                                  placeholder="Email"
                                  className="field text-xs"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Select
                                    name="signType"
                                    options={SIGN_TYPE_OPTIONS}
                                    defaultValue={sign.signType}
                                    className="text-xs"
                                  />
                                  <input
                                    name="quantity"
                                    type="number"
                                    min={1}
                                    defaultValue={sign.quantity}
                                    className="field text-xs"
                                  />
                                </div>
                                <input
                                  name="scheduledFor"
                                  type="date"
                                  defaultValue={toDateInput(sign.scheduledFor)}
                                  className="field text-xs"
                                />
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    name="permissionConfirmed"
                                    defaultChecked={sign.permissionConfirmed}
                                    className="size-4 accent-[var(--color-brand)]"
                                  />
                                  Permission confirmed
                                </label>
                                <textarea
                                  name="notes"
                                  defaultValue={sign.notes}
                                  rows={2}
                                  className="field text-xs"
                                />
                                <button type="submit" className="btn-primary w-full text-xs">
                                  Save
                                </button>
                              </form>
                            </details>

                            <form action={remove}>
                              <button type="submit" className="btn-ghost text-xs">
                                Delete
                              </button>
                            </form>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}

          {signs.length === 0 ? (
            <Card>
              <EmptyState
                title="No sign requests yet"
                hint="Requests appear here automatically when a canvasser ticks &ldquo;wants a sign&rdquo; at the door."
              />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="New sign request">
            <form action={createSignRequest} className="space-y-3">
              <Field label="Name">
                <input name="requesterName" className="field" required />
              </Field>
              <Field label="Address">
                <input name="addressLine" className="field" placeholder="12 Kent St W" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input name="city" className="field" />
                </Field>
                <Field label="Postal code">
                  <input name="postalCode" className="field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input name="phone" type="tel" className="field" />
                </Field>
                {campaign.usesWards ? (
                  <Field label="Ward">
                    <input name="ward" className="field" />
                  </Field>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sign type">
                  <Select name="signType" options={SIGN_TYPE_OPTIONS} defaultValue="SMALL_LAWN" />
                </Field>
                <Field label="How many">
                  <input name="quantity" type="number" min={1} defaultValue={1} className="field" />
                </Field>
              </div>
              <Check name="permissionConfirmed" label="Owner has confirmed permission" />
              <Field label="Notes" hint="Where on the lot, dogs, anything the crew needs.">
                <textarea name="notes" rows={2} className="field" />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Add request
              </button>
            </form>
          </Card>

          <Card title="Inventory" description="How many signs the campaign owns.">
            <form action={setInventory} className="space-y-3">
              {SIGN_TYPE_OPTIONS.map((option) => (
                <Field key={option.value} label={option.label}>
                  <input
                    name={`quantity_${option.value}`}
                    type="number"
                    min={0}
                    defaultValue={owned.get(option.value) ?? 0}
                    className="field"
                  />
                </Field>
              ))}
              <button type="submit" className="btn-secondary w-full">
                Save inventory
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
