"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CONTACT_METHODS, CONTACT_RESULTS, joinList } from "@/lib/enums";
import { bool, date, intOrNull, list, oneOf, str, strOrNull } from "@/lib/form";
import { canonicalStreet, normalisePostal, normaliseStreet } from "@/lib/address";
import { createSignRequestForVoter } from "@/lib/sign-requests";

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
  latitude?: number | null;
  longitude?: number | null;
  geocodePrecision?: string;
}): Promise<string | null> {
  const streetName = normaliseStreet(input.streetName);
  const streetNumber = input.streetNumber.trim();
  if (streetName === "" && streetNumber === "") return null;

  const unit = input.unit.trim();
  const city = input.city.trim();
  const postalCode = normalisePostal(input.postalCode);
  const streetKey = canonicalStreet(input.streetName);

  // Match on the address itself — number, canonical street, unit, city — and
  // deliberately NOT on postal code. The municipality's civic address file has
  // no postal codes at all while the clerk's voters' list does, so keying on it
  // would give every door two records, one from each import. The street is
  // matched on its canonical key for the same reason: the two sources spell
  // "Yonge Street South" and "YONGE ST S" differently.
  const existing = await db.household.findFirst({
    where: { streetKey, streetNumber, unit, city },
  });

  if (existing) {
    // Later imports fill gaps but never overwrite. A postal code from the
    // voters' list is worth adding to an address-file household; coordinates
    // from the address file are worth adding to one the voters' list created.
    // Neither should clobber a value already there, and a hand-placed pin is
    // never touched.
    const fill: Record<string, unknown> = {};
    if (postalCode && !existing.postalCode) fill.postalCode = postalCode;
    if (input.ward.trim() && !existing.ward) fill.ward = input.ward.trim();
    if (input.pollNumber.trim() && !existing.pollNumber) {
      fill.pollNumber = input.pollNumber.trim();
    }
    if (
      input.latitude != null &&
      input.longitude != null &&
      existing.latitude == null &&
      existing.geocodeStatus !== "MANUAL"
    ) {
      fill.latitude = input.latitude;
      fill.longitude = input.longitude;
      fill.geocodeStatus = "OK";
      fill.geocodePrecision = input.geocodePrecision ?? "ROOFTOP";
      fill.geocodedAt = new Date();
    }

    if (Object.keys(fill).length > 0) {
      await db.household.update({ where: { id: existing.id }, data: fill });
    }
    return existing.id;
  }

  const hasCoords = input.latitude != null && input.longitude != null;
  const created = await db.household.create({
    data: {
      streetNumber,
      streetName,
      streetKey,
      unit,
      city,
      postalCode,
      ward: input.ward.trim(),
      pollNumber: input.pollNumber.trim(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geocodeStatus: hasCoords ? "OK" : "PENDING",
      geocodePrecision: hasCoords ? (input.geocodePrecision ?? "ROOFTOP") : "",
      geocodedAt: hasCoords ? new Date() : null,
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
        canonicalStreet(row.streetName ?? ""),
        (row.unit ?? "").trim(),
        (row.city ?? "").trim(),
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

/* --------------------------------------------------------- address import */

export type AddressRow = {
  streetNumber?: string;
  streetName?: string;
  unit?: string;
  city?: string;
  postalCode?: string;
  ward?: string;
  pollNumber?: string;
  latitude?: string;
  longitude?: string;
};

export type AddressImportResult = {
  created: number;
  updated: number;
  skipped: number;
  withCoordinates: number;
  errors: string[];
};

/**
 * Load a municipal civic address file.
 *
 * This is separate from the voters' list import because the two answer
 * different questions: the address file is every door in the municipality,
 * while the voters' list is the people entitled to vote at some of them.
 * Loading addresses first gives a complete map and true door counts per
 * street; importing the voters' list afterwards attaches people to the doors
 * already there rather than creating a second set.
 *
 * Address-point files of this kind carry coordinates, so households created
 * here need no geocoding at all.
 */
export async function importAddresses(rows: AddressRow[]): Promise<AddressImportResult> {
  const result: AddressImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    withCoordinates: 0,
    errors: [],
  };

  for (const [index, row] of rows.entries()) {
    const streetName = normaliseStreet(row.streetName ?? "");
    const streetNumber = (row.streetNumber ?? "").trim();

    if (streetName === "" || streetNumber === "") {
      result.skipped++;
      continue;
    }

    const latitude = toCoordinate(row.latitude, -90, 90);
    const longitude = toCoordinate(row.longitude, -180, 180);

    try {
      const existing = await db.household.findFirst({
        where: {
          streetKey: canonicalStreet(row.streetName ?? ""),
          streetNumber,
          unit: (row.unit ?? "").trim(),
          city: (row.city ?? "").trim(),
        },
        select: { id: true },
      });

      await upsertHousehold({
        streetNumber,
        streetName,
        unit: row.unit ?? "",
        city: row.city ?? "",
        postalCode: row.postalCode ?? "",
        ward: row.ward ?? "",
        pollNumber: row.pollNumber ?? "",
        latitude,
        longitude,
        // Address-point data is surveyed to the property, not interpolated.
        geocodePrecision: "ROOFTOP",
      });

      if (existing) result.updated++;
      else result.created++;
      if (latitude !== null && longitude !== null) result.withCoordinates++;
    } catch (error) {
      result.skipped++;
      if (result.errors.length < 20) {
        result.errors.push(
          `Row ${index + 2}: ${error instanceof Error ? error.message : "could not import"}`,
        );
      }
    }
  }

  revalidatePath("/map");
  revalidatePath("/streets");
  revalidatePath("/canvass");
  return result;
}

function toCoordinate(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  // A zero here is nearly always a missing value rather than a real point in
  // the Gulf of Guinea.
  if (parsed === 0) return null;
  return parsed >= min && parsed <= max ? parsed : null;
}
