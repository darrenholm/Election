"use client";

import { useActionState } from "react";
import { registerCustomer } from "@/app/actions/shop";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { Field, Select } from "@/components/ui";

export function RegisterForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(registerCustomer, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <input name="contactName" autoComplete="name" required className="field" />
        </Field>
        <Field label="Phone" hint="Proofs get sorted out by phone.">
          <input name="phone" type="tel" autoComplete="tel" className="field" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" hint="This is your sign-in.">
          <input name="email" type="email" autoComplete="email" required className="field" />
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
          <input name="candidateName" required className="field" />
        </Field>
        <Field label="Running for">
          <Select name="office" options={OFFICE_OPTIONS} defaultValue="COUNCILLOR" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Municipality">
          <input name="municipality" className="field" />
        </Field>
        <Field label="Ward" hint="Leave blank if your council is elected at large.">
          <input name="ward" className="field" />
        </Field>
      </div>

      {error ? <p className="text-sm font-medium text-accent-ink">{error}</p> : null}

      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
