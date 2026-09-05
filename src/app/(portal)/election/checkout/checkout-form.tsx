"use client";

import { useActionState, useState } from "react";
import { submitOrder } from "@/app/actions/shop";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { DESIGN_FEE_CENTS } from "@/lib/shop/catalog";
import { formatCents } from "@/lib/money";
import { Field, Select } from "@/components/ui";

export type CheckoutDefaults = {
  contactName: string;
  phone: string;
  candidateName: string;
  office: string;
  municipality: string;
  ward: string;
  addressLine: string;
  city: string;
  postalCode: string;
  needsDesign: boolean;
  authorisationLine: string;
};

export function CheckoutForm({
  defaults,
  deliveryOffered,
}: {
  defaults: CheckoutDefaults;
  /** False when everything in the cart is collected from the shop. */
  deliveryOffered: boolean;
}) {
  const [error, action, pending] = useActionState(submitOrder, null);
  const [needsDesign, setNeedsDesign] = useState(defaults.needsDesign);
  const [delivery, setDelivery] = useState(false);

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold tracking-tight">Who the job is for</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Contact name">
            <input name="contactName" defaultValue={defaults.contactName} required className="field" />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={defaults.phone} required className="field" />
          </Field>
          <Field label="Name as it goes on the artwork">
            <input
              name="candidateName"
              defaultValue={defaults.candidateName}
              required
              className="field"
            />
          </Field>
          <Field label="Running for">
            <Select name="office" options={OFFICE_OPTIONS} defaultValue={defaults.office} />
          </Field>
          <Field label="Municipality">
            <input name="municipality" defaultValue={defaults.municipality} required className="field" />
          </Field>
          <Field label="Ward" hint="Blank if council is elected at large.">
            <input name="ward" defaultValue={defaults.ward} className="field" />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="Authorisation line"
            hint="What has to appear on the piece to say who paid for it — check the wording your clerk expects."
          >
            <input
              name="authorisationLine"
              defaultValue={defaults.authorisationLine}
              placeholder="Authorized by the CFO for the campaign to elect …"
              className="field"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold tracking-tight">Artwork</h2>
        <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-line bg-raise/60 p-3">
          <input
            type="checkbox"
            name="needsDesign"
            checked={needsDesign}
            onChange={(e) => setNeedsDesign(e.target.checked)}
            className="mt-0.5 size-4 rounded border-line accent-[var(--color-brand)]"
          />
          <span className="text-sm">
            <span className="font-semibold">Design it for me</span>
            <span className="block text-muted">
              {formatCents(DESIGN_FEE_CENTS)} for the whole order, whatever is on it.
            </span>
          </span>
        </label>

        {needsDesign ? (
          <div className="mt-3">
            <Field
              label="What are you after"
              hint="Colours, a slogan, what you want it to feel like, anything you have seen that you liked."
            >
              <textarea name="designBrief" rows={3} className="field" />
            </Field>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Upload your files below — or after you submit, from the order page. We check them before
            anything goes on press and ring you if something will not hold up at size.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold tracking-tight">When and where</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Needed by" hint="We will say straight away whether it is on.">
            <input type="date" name="neededBy" className="field" />
          </Field>
          {deliveryOffered ? (
            <Field label="Pickup or delivery">
              <select
                name="fulfilment"
                className="field"
                value={delivery ? "DELIVERY" : "PICKUP"}
                onChange={(e) => setDelivery(e.target.value === "DELIVERY")}
              >
                <option value="PICKUP">Pick up at the shop</option>
                <option value="DELIVERY">Deliver it — quote me</option>
              </select>
            </Field>
          ) : (
            <Field label="Collection">
              <input type="hidden" name="fulfilment" value="PICKUP" />
              <p className="rounded-lg border border-line bg-raise/60 px-3 py-2 text-sm text-muted">
                Picked up at the shop. Signs travel badly by courier and go out
                on a trailer or in the back of a car.
              </p>
            </Field>
          )}
        </div>

        {delivery ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Address" className="sm:col-span-3">
              <input name="addressLine" defaultValue={defaults.addressLine} className="field" />
            </Field>
            <Field label="Town">
              <input name="city" defaultValue={defaults.city} className="field" />
            </Field>
            <Field label="Postal code">
              <input name="postalCode" defaultValue={defaults.postalCode} className="field" />
            </Field>
          </div>
        ) : (
          <>
            <input type="hidden" name="addressLine" value={defaults.addressLine} />
            <input type="hidden" name="city" value={defaults.city} />
            <input type="hidden" name="postalCode" value={defaults.postalCode} />
          </>
        )}

        <div className="mt-3">
          <Field label="Anything else">
            <textarea name="notes" rows={2} className="field" />
          </Field>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Sending…" : "Submit the order"}
      </button>
      <p className="text-xs text-muted">
        Submitting does not charge you anything. We quote it back, and you pay by e-transfer once
        you are happy with the price — or settle up at the counter when you collect.
      </p>
    </form>
  );
}
