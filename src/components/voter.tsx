import Link from "next/link";
import { SUPPORT_LEVELS, SUPPORT_TEXT_COLORS, type SupportLevel } from "@/lib/enums";

export type Householdish = {
  streetNumber: string;
  streetName: string;
  unit: string;
  city: string;
  postalCode: string;
} | null;

/** One-line address for lists; the long form is on the detail page. */
export function addressLine(household: Householdish): string {
  if (!household) return "No address on file";
  const street = [household.streetNumber, titleCase(household.streetName)]
    .filter(Boolean)
    .join(" ");
  const unit = household.unit ? `Unit ${household.unit}` : "";
  return [street, unit].filter(Boolean).join(", ") || "No address on file";
}

export function fullAddress(household: Householdish): string {
  if (!household) return "No address on file";
  return [addressLine(household), titleCase(household.city), household.postalCode]
    .filter(Boolean)
    .join(", ");
}

/** Voters' lists arrive in shouting caps; the app displays them in title case. */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function SupportBadge({ level }: { level: number | null }) {
  if (level === null || level < 1 || level > 5) {
    return (
      <span className="inline-flex items-center rounded-full bg-raise px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line">
        Not IDed
      </span>
    );
  }
  const l = level as SupportLevel;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SUPPORT_TEXT_COLORS[l]}`}
      title={SUPPORT_LEVELS[l]}
    >
      {SUPPORT_LEVELS[l]}
    </span>
  );
}

export function VoterLink({
  id,
  firstName,
  lastName,
}: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  const name = `${titleCase(firstName)} ${titleCase(lastName)}`.trim();
  return (
    <Link href={`/voters/${id}`} className="font-medium hover:underline">
      {name || "Unnamed voter"}
    </Link>
  );
}
