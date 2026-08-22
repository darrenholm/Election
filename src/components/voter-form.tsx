import { SUPPORT_LEVEL_OPTIONS } from "@/lib/enums";
import { Check, Field, Select } from "./ui";

export type VoterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  birthYear: number | null;
  supportLevel: number | null;
  wantsSign: boolean;
  wantsToVolunteer: boolean;
  isDonorProspect: boolean;
  doNotContact: boolean;
  movedAway: boolean;
  deceased: boolean;
  tags: string;
  notes: string;
  household: {
    streetNumber: string;
    streetName: string;
    unit: string;
    city: string;
    postalCode: string;
    ward: string;
    pollNumber: string;
  } | null;
};

/**
 * The fields shared by "add voter" and "edit voter". Address fields write
 * through to the household record, which is why they are flat here rather than
 * nested — the server action resolves them into a household on save.
 */
export function VoterFormFields({
  voter,
  showWards = false,
}: {
  voter?: VoterFormValues;
  showWards?: boolean;
}) {
  const h = voter?.household;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input name="firstName" defaultValue={voter?.firstName ?? ""} className="field" required />
        </Field>
        <Field label="Last name">
          <input name="lastName" defaultValue={voter?.lastName ?? ""} className="field" />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={voter?.phone ?? ""} className="field" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={voter?.email ?? ""} className="field" />
        </Field>
        <Field label="Preferred language">
          <input name="language" defaultValue={voter?.language ?? ""} className="field" />
        </Field>
        <Field label="Birth year" hint="Optional — useful for age-targeted lists.">
          <input
            name="birthYear"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            defaultValue={voter?.birthYear ?? ""}
            className="field"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="field-label">Address</legend>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Number" className="sm:col-span-1">
            <input name="streetNumber" defaultValue={h?.streetNumber ?? ""} className="field" />
          </Field>
          <Field label="Street" className="sm:col-span-3">
            <input name="streetName" defaultValue={h?.streetName ?? ""} className="field" />
          </Field>
          <Field label="Unit" className="sm:col-span-2">
            <input name="unit" defaultValue={h?.unit ?? ""} className="field" />
          </Field>
          <Field label="City" className="sm:col-span-2">
            <input name="city" defaultValue={h?.city ?? ""} className="field" />
          </Field>
          <Field label="Postal code" className="sm:col-span-2">
            <input name="postalCode" defaultValue={h?.postalCode ?? ""} className="field" />
          </Field>
          {showWards ? (
            <Field label="Ward" className="sm:col-span-1">
              <input name="ward" defaultValue={h?.ward ?? ""} className="field" />
            </Field>
          ) : null}
          <Field label="Poll" className="sm:col-span-1">
            <input name="pollNumber" defaultValue={h?.pollNumber ?? ""} className="field" />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Support level">
          <Select
            name="supportLevel"
            options={SUPPORT_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            defaultValue={voter?.supportLevel ?? ""}
            includeBlank
            blankLabel="Not identified"
          />
        </Field>
        <Field label="Tags" hint="Comma-separated, e.g. transit,seniors">
          <input name="tags" defaultValue={voter?.tags ?? ""} className="field" />
        </Field>
      </div>

      <fieldset>
        <legend className="field-label">Flags</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Check name="wantsSign" label="Wants a lawn sign" defaultChecked={voter?.wantsSign} />
          <Check
            name="wantsToVolunteer"
            label="Offered to volunteer"
            defaultChecked={voter?.wantsToVolunteer}
          />
          <Check
            name="isDonorProspect"
            label="Donor prospect"
            defaultChecked={voter?.isDonorProspect}
          />
          <Check name="doNotContact" label="Do not contact" defaultChecked={voter?.doNotContact} />
          <Check name="movedAway" label="Moved away" defaultChecked={voter?.movedAway} />
          <Check name="deceased" label="Deceased" defaultChecked={voter?.deceased} />
        </div>
      </fieldset>

      <Field label="Notes">
        <textarea name="notes" rows={4} defaultValue={voter?.notes ?? ""} className="field" />
      </Field>
    </div>
  );
}
