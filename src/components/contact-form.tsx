import {
  CONTACT_METHOD_OPTIONS,
  CONTACT_RESULT_OPTIONS,
  SUPPORT_LEVEL_OPTIONS,
} from "@/lib/enums";
import { recordContact } from "@/app/actions/voters";
import { Check, Field, Select } from "./ui";

/**
 * The single form used to log a contact, at the door or on the phone. Kept
 * deliberately short: on a phone screen a canvasser should be able to tap a
 * support level and hit save without scrolling.
 */
export function ContactForm({
  voterId,
  volunteers,
  defaultVolunteerId,
  defaultMethod = "DOOR",
  compact = false,
}: {
  voterId: string;
  volunteers: { id: string; firstName: string; lastName: string }[];
  defaultVolunteerId?: string | null;
  defaultMethod?: string;
  compact?: boolean;
}) {
  return (
    <form action={recordContact} className="space-y-3">
      <input type="hidden" name="voterId" value={voterId} />

      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
        <Field label="Result">
          <Select name="result" options={CONTACT_RESULT_OPTIONS} defaultValue="SPOKE" />
        </Field>
        <Field label="Support level">
          <Select
            name="supportLevel"
            options={SUPPORT_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            includeBlank
            blankLabel="No change"
          />
        </Field>
        {!compact ? (
          <Field label="Method">
            <Select
              name="method"
              options={CONTACT_METHOD_OPTIONS}
              defaultValue={defaultMethod}
            />
          </Field>
        ) : (
          <input type="hidden" name="method" value={defaultMethod} />
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Check name="wantsSign" label="Wants a sign" />
        <Check name="wantsToVolunteer" label="Will volunteer" />
        <Check name="isDonorProspect" label="Might donate" />
      </div>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={compact ? 2 : 3}
          className="field"
          placeholder="Issues raised, follow-ups, anything worth remembering."
        />
      </Field>

      {!compact ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canvasser">
            <Select
              name="volunteerId"
              options={volunteers.map((v) => ({
                value: v.id,
                label: `${v.firstName} ${v.lastName}`.trim(),
              }))}
              defaultValue={defaultVolunteerId ?? ""}
              includeBlank
              blankLabel="Not recorded"
            />
          </Field>
          <Field label="When" hint="Leave blank for right now.">
            <input name="occurredAt" type="datetime-local" className="field" />
          </Field>
        </div>
      ) : (
        <input type="hidden" name="volunteerId" value={defaultVolunteerId ?? ""} />
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">
          Save contact
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name="markDoNotContact" className="size-4 accent-[var(--color-brand)]" />
          Also mark do-not-contact
        </label>
      </div>
    </form>
  );
}
