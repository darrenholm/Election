"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CONTACT_METHODS, CONTACT_RESULTS, joinList } from "@/lib/enums";
import { bool, date, intOrNull, list, oneOf, str, strOrNull } from "@/lib/form";
import { normalisePostal, normaliseStreet } from "@/lib/address";

/* -------------------------------------------------------------- households */

/**
 * Find or create the household for an address. Households are keyed on the
 * normalised address so two spellings of the same street do not split a
 * building into several doors on the walk list.
 */
export async function upsertHousehold(input: {
  streetNumber: string;
  streetName: string;
  unit: string;
  city: string;
  postalCode: string;
  ward: string;
  pollNumber: string;
}): Promise<string | null> {
  const streetName = normaliseStreet(input.streetName);
  const streetNumber = input.streetNumber.trim();
  if (streetName === "" && streetNumber === "") return null;

  const unit = input.unit.trim();
  const postalCode = normalisePostal(input.postalCode);

  const existing = await db.household.findFirst({
    where: { streetName, streetNumber, unit, postalCode },
  });
  if (existing) return existing.id;

  const created = await db.household.create({
    data: {
      streetNumber,
      streetName,
      unit,
      city: input.city.trim(),
      postalCode,
      ward: input.ward.trim(),
      pollNumber: input.pollNumber.trim(),
    },
  });
  return created.id;
}

/* ------------------------------------------------------------------ voters */

function voterFields(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    language: str(formData, "language"),
    birthYear: intOrNull(formData, "birthYear"),
    supportLevel: clampSupport(intOrNull(formData, "supportLevel")),
    wantsSign: bool(formData, "wantsSign"),
    wantsToVolunteer: bool(formData, "wantsToVolunteer"),
    isDonorProspect: bool(formData, "isDonorProspect"),
    doNotContact: bool(formData, "doNotContact"),
    movedAway: bool(formData, "movedAway"),
    deceased: bool(formData, "deceased"),
    tags: joinList(list(formData, "tags")),
    notes: str(formData, "notes"),
  };
}

function clampSupport(value: number | null): number | null {
  if (value === null) return null;
  return value >= 1 && value <= 5 ? value : null;
}

export async function createVoter(formData: FormData) {
  const householdId = await upsertHousehold({
    streetNumber: str(formData, "streetNumber"),
    streetName: str(formData, "streetName"),
    unit: str(formData, "unit"),
    city: str(formData, "city"),
    postalCode: str(formData, "postalCode"),
    ward: str(formData, "ward"),
    pollNumber: str(formData, "pollNumber"),
  });

  const voter = await db.voter.create({
    data: { ...voterFields(formData), householdId },
  });

  revalidatePath("/voters");
  redirect(`/voters/${voter.id}`);
}

export async function updateVoter(voterId: string, formData: FormData) {
  const householdId = await upsertHousehold({
    streetNumber: str(formData, "streetNumber"),
    streetName: str(formData, "streetName"),
    unit: str(formData, "unit"),
    city: str(formData, "city"),
    postalCode: str(formData, "postalCode"),
    ward: str(formData, "ward"),
    pollNumber: str(formData, "pollNumber"),
  });

  await db.voter.update({
    where: { id: voterId },
    data: { ...voterFields(formData), householdId },
  });

  revalidatePath("/voters");
  revalidatePath(`/voters/${voterId}`);
}

export async function deleteVoter(voterId: string) {
  await db.voter.delete({ where: { id: voterId } });
  revalidatePath("/voters");
  redirect("/voters");
}

/** Marks a voter as having voted — used by scrutineers on voting day. */
export async function toggleVoted(voterId: string, voted: boolean) {
  await db.voter.update({
    where: { id: voterId },
    data: { votedAt: voted ? new Date() : null },
  });
  revalidatePath(`/voters/${voterId}`);
}

/* ------------------------------------------------------------- canvassing */

/**
 * Record one contact attempt and roll its outcome up onto the voter, so the
 * voter file always reflects the most recent thing the campaign learned.
 */
export async function recordContact(formData: FormData) {
  const voterId = str(formData, "voterId");
  if (!voterId) return;

  const result = oneOf(formData, "result", CONTACT_RESULTS, "SPOKE");
  const supportLevel = clampSupport(intOrNull(formData, "supportLevel"));
  const wantsSign = bool(formData, "wantsSign");
  const wantsToVolunteer = bool(formData, "wantsToVolunteer");
  const isDonorProspect = bool(formData, "isDonorProspect");

  await db.contactAttempt.create({
    data: {
      voterId,
      volunteerId: strOrNull(formData, "volunteerId"),
      method: oneOf(formData, "method", CONTACT_METHODS, "DOOR"),
      result,
      supportLevel,
      issues: joinList(list(formData, "issues")),
      notes: str(formData, "notes"),
      occurredAt: date(formData, "occurredAt") ?? new Date(),
    },
  });

  // A canvass result carries facts about the voter, not just the visit.
  const voterUpdate: Record<string, unknown> = {};
  if (supportLevel !== null) voterUpdate.supportLevel = supportLevel;
  if (wantsSign) voterUpdate.wantsSign = true;
  if (wantsToVolunteer) voterUpdate.wantsToVolunteer = true;
  if (isDonorProspect) voterUpdate.isDonorProspect = true;
  if (result === "MOVED") voterUpdate.movedAway = true;
  if (result === "DECEASED") voterUpdate.deceased = true;
  if (result === "REFUSED" && bool(formData, "markDoNotContact")) {
    voterUpdate.doNotContact = true;
  }

  if (Object.keys(voterUpdate).length > 0) {
    await db.voter.update({ where: { id: voterId }, data: voterUpdate });
  }

  // A sign promise at the door should show up on the sign crew's board without
  // anyone re-typing the address.
  if (wantsSign) {
    await createSignRequestForVoter(voterId);
  }

  revalidatePath("/voters");
  revalidatePath(`/voters/${voterId}`);
  revalidatePath("/canvass");
  revalidatePath("/signs");
}

async function createSignRequestForVoter(voterId: string) {
  const existing = await db.signRequest.findFirst({
    where: { voterId, status: { notIn: ["REMOVED", "DECLINED"] } },
  });
  if (existing) return;

  const voter = await db.voter.findUnique({
    where: { id: voterId },
    include: { household: true },
  });
  if (!voter) return;

  await db.signRequest.create({
    data: {
      voterId,
      requesterName: `${voter.firstName} ${voter.lastName}`.trim(),
      phone: voter.phone,
      email: voter.email,
      addressLine: voter.household
        ? `${voter.household.streetNumber} ${voter.household.streetName}${
            voter.household.unit ? ` Unit ${voter.household.unit}` : ""
          }`.trim()
        : "",
      city: voter.household?.city ?? "",
      postalCode: voter.household?.postalCode ?? "",
      ward: voter.household?.ward ?? "",
      notes: "Requested at the door.",
    },
  });
}

/* ------------------------------------------------------------------- turfs */

export async function createTurf(formData: FormData) {
  const turf = await db.turf.create({
    data: {
      name: str(formData, "name") || "Untitled turf",
      description: str(formData, "description"),
      ward: str(formData, "ward"),
      assignedToId: strOrNull(formData, "assignedToId"),
      status: strOrNull(formData, "assignedToId") ? "ASSIGNED" : "UNASSIGNED",
    },
  });

  // Turf is defined by street names: every household on those streets joins it.
  const streets = list(formData, "streets")
    .flatMap((s) => s.split(/[\n,]/))
    .map(normaliseStreet)
    .filter(Boolean);

  if (streets.length > 0) {
    await db.household.updateMany({
      where: { streetName: { in: streets } },
      data: { turfId: turf.id },
    });
  }

  revalidatePath("/canvass");
  redirect(`/canvass/${turf.id}`);
}

export async function updateTurf(turfId: string, formData: FormData) {
  const assignedToId = strOrNull(formData, "assignedToId");
  await db.turf.update({
    where: { id: turfId },
    data: {
      name: str(formData, "name"),
      description: str(formData, "description"),
      ward: str(formData, "ward"),
      assignedToId,
      status: str(formData, "status") || (assignedToId ? "ASSIGNED" : "UNASSIGNED"),
    },
  });
  revalidatePath("/canvass");
  revalidatePath(`/canvass/${turfId}`);
}

export async function deleteTurf(turfId: string) {
  await db.turf.delete({ where: { id: turfId } });
  revalidatePath("/canvass");
  redirect("/canvass");
}

/** Add every household on a street to a turf, from the turf page. */
export async function addStreetToTurf(turfId: string, formData: FormData) {
  const street = normaliseStreet(str(formData, "street"));
  if (!street) return;
  await db.household.updateMany({
    where: { streetName: street },
    data: { turfId },
  });
  revalidatePath(`/canvass/${turfId}`);
}

export async function removeHouseholdFromTurf(turfId: string, householdId: string) {
  await db.household.update({ where: { id: householdId }, data: { turfId: null } });
  revalidatePath(`/canvass/${turfId}`);
}

/* ------------------------------------------------------------------ import */

export type ImportRow = {
  externalId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  streetNumber?: string;
  streetName?: string;
  unit?: string;
  city?: string;
  postalCode?: string;
  ward?: string;
  pollNumber?: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  households: number;
  errors: string[];
};

/**
 * Bulk-load a voters' list. Rows carrying an external id update the matching
 * voter instead of duplicating it, so a refreshed list from the clerk can be
 * re-imported without losing the support levels already collected.
 */
export async function importVoters(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    households: 0,
    errors: [],
  };

  // Cache households within the run: a street of 200 doors would otherwise
  // issue 200 identical lookups.
  const householdCache = new Map<string, string | null>();

  for (const [index, row] of rows.entries()) {
    const firstName = (row.firstName ?? "").trim();
    const lastName = (row.lastName ?? "").trim();

    if (firstName === "" && lastName === "") {
      result.skipped++;
      continue;
    }

    try {
      const key = [
        (row.streetNumber ?? "").trim(),
        normaliseStreet(row.streetName ?? ""),
        (row.unit ?? "").trim(),
        normalisePostal(row.postalCode ?? ""),
      ].join("|");

      let householdId = householdCache.get(key);
      if (householdId === undefined) {
        const before = householdCache.size;
        householdId = await upsertHousehold({
          streetNumber: row.streetNumber ?? "",
          streetName: row.streetName ?? "",
          unit: row.unit ?? "",
          city: row.city ?? "",
          postalCode: row.postalCode ?? "",
          ward: row.ward ?? "",
          pollNumber: row.pollNumber ?? "",
        });
        householdCache.set(key, householdId);
        if (householdId && householdCache.size > before) result.households++;
      }

      const data = {
        firstName,
        lastName,
        email: (row.email ?? "").trim(),
        phone: (row.phone ?? "").trim(),
        householdId,
      };

      const externalId = (row.externalId ?? "").trim();
      if (externalId) {
        const existing = await db.voter.findUnique({ where: { externalId } });
        if (existing) {
          await db.voter.update({ where: { externalId }, data });
          result.updated++;
        } else {
          await db.voter.create({ data: { ...data, externalId } });
          result.created++;
        }
      } else {
        await db.voter.create({ data });
        result.created++;
      }
    } catch (error) {
      result.skipped++;
      if (result.errors.length < 20) {
        result.errors.push(
          `Row ${index + 2}: ${error instanceof Error ? error.message : "could not import"}`,
        );
      }
    }
  }

  revalidatePath("/voters");
  revalidatePath("/canvass");
  return result;
}
