/**
 * Recognising a voter who is already on file.
 *
 * The clerk reissues the voters' list several times over a campaign, and every
 * issue is a fresh CSV of substantially the same people. Matching on the List
 * ID alone is not enough: plenty of lists carry no such column, and the ones
 * that do have been seen to renumber between issues. So names are matched too,
 * normalised — the same person arrives as "O'BRIEN, Mary-Jane" in one issue and
 * "Obrien, Mary Jane" in the next, and a re-import that treats those as two
 * people doubles the voter file.
 *
 * Pure helpers in their own module rather than in the server action: a
 * "use server" file may only export async functions, and the import wizard
 * needs these on the client to describe what a re-import would do.
 */

import { canonicalStreet } from "@/lib/address";

/**
 * Fold a name down to what two spellings of it have in common: accents
 * stripped, case dropped, punctuation and spacing removed. "Dubé", "DUBE" and
 * "dube" all land on "dube"; "Mary-Jane" and "Mary Jane" on "maryjane".
 */
export function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** The key two rows must share to be the same person by name. */
export function voterNameKey(firstName: string, lastName: string): string {
  return `${nameKey(lastName)}|${nameKey(firstName)}`;
}

/**
 * A looser key: surname plus the first letter of the given name.
 *
 * This is what catches a list that has switched from "Robert" to "Rob", or
 * from a full given name to an initial. It is deliberately never used on its
 * own — only to break a tie when the address also agrees — because on a
 * surname as common as Smith it would happily merge two different people.
 */
export function voterInitialKey(firstName: string, lastName: string): string {
  return `${nameKey(lastName)}|${nameKey(firstName).slice(0, 1)}`;
}

/** The key that decides whether two rows describe the same door. */
export function householdKey(input: {
  streetNumber?: string;
  streetName?: string;
  unit?: string;
  city?: string;
}): string {
  return [
    (input.streetNumber ?? "").trim().toLowerCase(),
    canonicalStreet(input.streetName ?? ""),
    (input.unit ?? "").trim().toLowerCase(),
    (input.city ?? "").trim().toLowerCase(),
  ].join("|");
}

/** "12A Main St, Unit 3, Walkerton" — one line, for showing a match. */
export function formatAddress(input: {
  streetNumber?: string;
  streetName?: string;
  unit?: string;
  city?: string;
}): string {
  const street = [(input.streetNumber ?? "").trim(), (input.streetName ?? "").trim()]
    .filter(Boolean)
    .join(" ");
  const unit = (input.unit ?? "").trim();
  return [street, unit ? `Unit ${unit}` : "", (input.city ?? "").trim()]
    .filter(Boolean)
    .join(", ");
}

/** "Mary-Jane T. O'Brien" — for naming the voter a row would update. */
export function formatName(input: {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}): string {
  return [input.firstName, input.middleName, input.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** One field the import would change on a voter already on file. */
export type ImportChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

/**
 * What a row would change about the voter it matched.
 *
 * Only non-empty incoming values are considered. A clerk's list that carries
 * no phone column must not wipe the phone numbers the campaign has collected
 * by hand over the past month — an import fills gaps and corrects what it
 * actually knows, and is silent about the rest.
 */
export function diffVoter(
  existing: {
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
  },
  incoming: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
  },
): ImportChange[] {
  const fields = [
    { field: "firstName", label: "First name" },
    { field: "middleName", label: "Middle name" },
    { field: "lastName", label: "Last name" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "address", label: "Address" },
  ] as const;

  const changes: ImportChange[] = [];
  for (const { field, label } of fields) {
    const to = (incoming[field] ?? "").trim();
    if (to === "") continue;
    const from = existing[field] ?? "";
    if (from.trim() === to) continue;
    changes.push({ field, label, from, to });
  }
  return changes;
}

/* --------------------------------------------------------------- matching */

/** A voter already on file, as the matcher needs to see them. */
export type MatchCandidate = {
  id: string;
  externalId: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  household: {
    streetNumber: string;
    streetName: string;
    unit: string;
    city: string;
  } | null;
};

/** What a row is matched against, built once per chunk rather than per row. */
export type CandidateIndex = {
  byExternalId: Map<string, MatchCandidate>;
  byName: Map<string, MatchCandidate[]>;
  byInitial: Map<string, MatchCandidate[]>;
};

export type MatchOutcome =
  | { kind: "match"; voter: MatchCandidate; matchedBy: "listId" | "nameAndAddress" | "name" }
  /** No single voter could be settled on. `rivals` counts those that tied. */
  | { kind: "none"; rivals: number };

export function indexCandidates(
  withListId: MatchCandidate[],
  withSurname: MatchCandidate[],
): CandidateIndex {
  const byExternalId = new Map<string, MatchCandidate>();
  for (const voter of withListId) {
    if (voter.externalId) byExternalId.set(voter.externalId, voter);
  }

  const byName = new Map<string, MatchCandidate[]>();
  const byInitial = new Map<string, MatchCandidate[]>();
  for (const voter of withSurname) {
    push(byName, voterNameKey(voter.firstName, voter.lastName), voter);
    push(byInitial, voterInitialKey(voter.firstName, voter.lastName), voter);
  }

  return { byExternalId, byName, byInitial };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

/**
 * Decide which voter on file, if any, an incoming row is.
 *
 * The order is deliberate, strongest evidence first:
 *
 *  1. The clerk's list ID. Unique within the municipality and meant for
 *     exactly this, so nothing else is consulted when it hits.
 *  2. The full name. One person of that name is a match. Several, and only the
 *     address can separate them.
 *  3. Surname, first initial and address, all three agreeing on one person.
 *     This is what carries a list that has switched from "Robert" to "Rob". An
 *     initial on its own would merge strangers, so the address is required.
 *
 * Anything short of a single answer returns `none` with the number that tied,
 * because adding a duplicate somebody can see and merge is a smaller harm than
 * quietly writing one person's details over another's.
 */
export function matchVoter(
  row: {
    externalId?: string;
    firstName?: string;
    lastName?: string;
    streetNumber?: string;
    streetName?: string;
    unit?: string;
    city?: string;
  },
  index: CandidateIndex,
): MatchOutcome {
  const firstName = (row.firstName ?? "").trim();
  const lastName = (row.lastName ?? "").trim();
  if (firstName === "" && lastName === "") return { kind: "none", rivals: 0 };

  const externalId = (row.externalId ?? "").trim();
  if (externalId) {
    const byId = index.byExternalId.get(externalId);
    if (byId) return { kind: "match", voter: byId, matchedBy: "listId" };
  }

  const wanted = householdKey(row);
  const hasAddress = wanted.replace(/\|/g, "") !== "";

  const sameName = index.byName.get(voterNameKey(firstName, lastName)) ?? [];
  if (sameName.length === 1) {
    const voter = sameName[0];
    const sameDoor = voter.household !== null && householdKey(voter.household) === wanted;
    return { kind: "match", voter, matchedBy: sameDoor ? "nameAndAddress" : "name" };
  }
  if (sameName.length > 1) {
    const atAddress = hasAddress
      ? sameName.filter((v) => v.household !== null && householdKey(v.household) === wanted)
      : [];
    if (atAddress.length === 1) {
      return { kind: "match", voter: atAddress[0], matchedBy: "nameAndAddress" };
    }
    return { kind: "none", rivals: sameName.length };
  }

  if (!hasAddress) return { kind: "none", rivals: 0 };

  const sameInitial = (index.byInitial.get(voterInitialKey(firstName, lastName)) ?? []).filter(
    (v) => v.household !== null && householdKey(v.household) === wanted,
  );
  if (sameInitial.length === 1) {
    return { kind: "match", voter: sameInitial[0], matchedBy: "nameAndAddress" };
  }
  return { kind: "none", rivals: sameInitial.length > 1 ? sameInitial.length : 0 };
}
