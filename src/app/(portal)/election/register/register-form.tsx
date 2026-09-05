"use client";

import { useActionState } from "react";
import { registerCustomer } from "@/app/actions/shop";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { Field, Select } from "@/components/ui";

export type RegisterPrefill = {
  candidateName: string;
  office: string;
  municipality: string;
  ward: string;
  contactName: string;
  email: string;
  phone: string;
};

export function RegisterForm({
  next,
  prefill,
}: {
  next: string;
  /** Filled in from the campaign, when the candidate came from the manager. */
  prefill?: RegisterPrefill | null;
}) {
  const [error, action, pending] = useActionState(registerCustomer, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      {prefill ? (
        <p className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-xs leading-relaxed text-brand-ink">
          Filled in from your campaign. Change anything that is not right — this
          account is separate from your campaign software, and you still need a
          password of your own.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <input
            name="contactName"
            autoComplete="name"
            defaultValue={prefill?.contactName ?? ""}
            required
            className="field"
          />
        </Field>
        <Field label="Phone" hint="Proofs get sorted out by phone.">
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={prefill?.phone ?? ""}
            className="field"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" hint="This is your sign-in.">
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={prefill?.email ?? ""}
            required
            className="field"
          />
        </Field>
        <Field label="Password" hint="At least 12 characters.">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="field"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name as it goes on the signs">
          <input
            name="candidateName"
            defaultValue={prefill?.candidateName ?? ""}
            required
            className="field"
          />
        </Field>
        <Field label="Running for">
          <Select name="office" options={OFFICE_OPTIONS} defaultValue={prefill?.office ?? "COUNCILLOR"} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Municipality">
          <input name="municipality" defaultValue={prefill?.municipality ?? ""} className="field" />
        </Field>
        <Field label="Ward" hint="Leave blank if your council is elected at large.">
          <input name="ward" defaultValue={prefill?.ward ?? ""} className="field" />
        </Field>
      </div>

      {error ? <p className="text-sm font-medium text-accent-ink">{error}</p> : null}

      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
