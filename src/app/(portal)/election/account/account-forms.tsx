"use client";

import { useActionState } from "react";
import { changeCustomerPassword, updateCustomerProfile } from "@/app/actions/shop";
import { OFFICE_OPTIONS } from "@/lib/enums";
import { Card, Field, Select } from "@/components/ui";

type Account = {
  contactName: string;
  phone: string;
  candidateName: string;
  office: string;
  municipality: string;
  ward: string;
  addressLine: string;
  city: string;
  postalCode: string;
};

export function AccountForms({ account }: { account: Account }) {
  const [profileMessage, saveProfile, savingProfile] = useActionState(updateCustomerProfile, null);
  const [passwordMessage, savePassword, savingPassword] = useActionState(
    changeCustomerPassword,
    null,
  );

  return (
    <div className="space-y-6">
      <Card title="Your details">
        <form action={saveProfile} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name">
              <input name="contactName" defaultValue={account.contactName} className="field" />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" defaultValue={account.phone} className="field" />
            </Field>
            <Field label="Name as it goes on the artwork">
              <input name="candidateName" defaultValue={account.candidateName} className="field" />
            </Field>
            <Field label="Running for">
              <Select name="office" options={OFFICE_OPTIONS} defaultValue={account.office} />
            </Field>
            <Field label="Municipality">
              <input name="municipality" defaultValue={account.municipality} className="field" />
            </Field>
            <Field label="Ward">
              <input name="ward" defaultValue={account.ward} className="field" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Address" className="sm:col-span-3">
              <input name="addressLine" defaultValue={account.addressLine} className="field" />
            </Field>
            <Field label="Town">
              <input name="city" defaultValue={account.city} className="field" />
            </Field>
            <Field label="Postal code">
              <input name="postalCode" defaultValue={account.postalCode} className="field" />
            </Field>
          </div>

          {profileMessage ? (
            <p className="text-sm font-medium text-brand-ink">{profileMessage}</p>
          ) : null}
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? "Saving…" : "Save"}
          </button>
        </form>
      </Card>

      <Card title="Password">
        <form action={savePassword} className="space-y-3 sm:max-w-sm">
          <Field label="Current password">
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="field"
            />
          </Field>
          <Field label="New password" hint="At least 12 characters.">
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              className="field"
            />
          </Field>
          <Field label="New password again">
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="field"
            />
          </Field>
          {passwordMessage ? (
            <p className="text-sm font-medium text-accent-ink">{passwordMessage}</p>
          ) : null}
          <button type="submit" disabled={savingPassword} className="btn-secondary">
            {savingPassword ? "Changing…" : "Change password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
