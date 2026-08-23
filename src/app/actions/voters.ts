"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CONTACT_METHODS, CONTACT_RESULTS, joinList } from "@/lib/enums";
import { bool, date, intOrNull, list, oneOf, str, strOrNull } from "@/lib/form";
import { canonicalStreet, normalisePostal, normaliseStreet } from "@/lib/address";
import { getActiveCampaign, requireCampaignId } from "@/lib/campaign";
import { requireCampaign, requireOwned, requireVoterMunicipality } from "@/lib/guard";
import { createSignRequestForVoter } from "@/lib/sign-requests";
import { upsertVoterState } from "@/lib/voter-state";

/* -------------------------------------------------------------- households */

/**
 * Find or create the household for an address within a municipality.
 *
 * Matching is on number, canonical street, unit and city — deliberately NOT on
 * postal code, because civic address files carry none while the clerk's voters'
 * list does, and keying on it would give every door two records. Later imports
 * fill gaps but never overwrite.
 */
async function upsertHousehold(input: {
  municipalityId: string;
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

  const existing = await db.household.findFirst({
    where: { municipalityId: input.municipalityId, streetKey, streetNumber, unit, city },
  });

  if (existing) {
    const fill: Record<string, unknown> = {};
    if (postalCode && !existing.postalCode) fill.postalCode = postalCode;
    if (input.ward.trim() && !existing.ward) fill.ward = input.ward.trim();
    if (input.pollNumber.trim() && !existing.pollNumber) {
      fill.pollNumber = input.pollNumber.trim();
    }
    // A hand-placed pin is never replaced by an imported coordinate.
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
      municipalityId: input.municipalityId,
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

function clampSupport(value: number | null): number | null {
  if (value === null) return null;
  return value >= 1 && value <= 5 ? value : null;
}

/** Fields that describe the person, and so are shared by every campaign. */
function voterIdentityFields(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    language: str(formData, "language"),
    birthYear: intOrNull(formData, "birthYear"),
    movedAway: bool(formData, "movedAway"),
    deceased: bool(formData, "deceased"),
  };
}

/** Fields that are one campaign's opinion, and so are scoped to it. */
function voterStateFields(formData: FormData) {
  return {
    supportLevel: clampSupport(intOrNull(formData, "supportLevel")),
    wantsSign: bool(formData, "wantsSign"),
    wantsToVolunteer: bool(formData, "wantsToVolunteer"),
    isDonorProspect: bool(formData, "isDonorProspect"),
    doNotContact: bool(formData, "doNotContact"),
    tags: joinList(list(formData, "tags")),
    notes: str(formData, "notes"),
  };
}

export async function createVoter(formData: FormData) {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const householdId = await upsertHousehold({
    municipalityId: campaign.municipalityId,
    streetNumber: str(formData, "streetNumber"),
    streetName: str(formData, "streetName"),
    unit: str(formData, "unit"),
    city: str(formData, "city"),
    postalCode: str(formData, "postalCode"),
    ward: str(formData, "ward"),
    pollNumber: str(formData, "pollNumber"),
  });

  const voter = await db.voter.create({
    data: {
      ...voterIdentityFields(formData),
      municipalityId: campaign.municipalityId,
      householdId,
    },
  });

  await upsertVoterState(campaign.id, voter.id, voterStateFields(formData));

  revalidatePath("/voters");
  redirect(`/voters/${voter.id}`);
}

export async function updateVoter(voterId: string, formData: FormData) {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  // The address written below is built from the active campaign's
  // municipality, so a voter from another town would be quietly relocated.
  const municipalityId = await requireVoterMunicipality(voterId);
  if (municipalityId !== campaign.municipalityId) return;

  const householdId = await upsertHousehold({
    municipalityId: campaign.municipalityId,
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
    data: { ...voterIdentityFields(formData), householdId },
  });

  await upsertVoterState(campaign.id, voterId, voterStateFields(formData));

  revalidatePath("/voters");
  revalidatePath(`/voters/${voterId}`);
}

/**
 * Remove a voter from the municipal file entirely. This affects every campaign
 * in the town, not just the active one — which is why the page says so.
 */
export async function deleteVoter(voterId: string) {
  // This removes the person from the shared municipal file, so every candidate
  // in the town loses them. Manager-and-up, and only in a town this user works.
  if (!(await requireVoterMunicipality(voterId, "MANAGER"))) return;

  await db.voter.delete({ where: { id: voterId } });
  revalidatePath("/voters");
  redirect("/voters");
}

/** Marks a voter as having voted, as observed by this campaign's scrutineers. */
export async function toggleVoted(voterId: string, voted: boolean) {
  const campaignId = await requireCampaignId();
  if (!(await requireVoterMunicipality(voterId))) return;

  await upsertVoterState(campaignId, voterId, { votedAt: voted ? new Date() : null });
  revalidatePath(`/voters/${voterId}`);
}

/* ------------------------------------------------------------- canvassing */

/**
 * Record one contact and roll its outcome onto this campaign's view of the
 * voter. Facts about the person — moved, deceased — go on the shared record;
 * opinions and consent stay with the campaign.
 */
export async function recordContact(formData: FormData) {
  const campaignId = await requireCampaignId();
  const voterId = str(formData, "voterId");
  if (!voterId) return;
  if (!(await requireVoterMunicipality(voterId))) return;

  const result = oneOf(formData, "result", CONTACT_RESULTS, "SPOKE");
  const supportLevel = clampSupport(intOrNull(formData, "supportLevel"));
  const wantsSign = bool(formData, "wantsSign");

  await db.contactAttempt.create({
    data: {
      campaignId,
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

  const state: Record<string, unknown> = {};
  if (supportLevel !== null) state.supportLevel = supportLevel;
  if (wantsSign) state.wantsSign = true;
  if (bool(formData, "wantsToVolunteer")) state.wantsToVolunteer = true;
  if (bool(formData, "isDonorProspect")) state.isDonorProspect = true;
  if (result === "REFUSED" && bool(formData, "markDoNotContact")) state.doNotContact = true;
  if (Object.keys(state).length > 0) await upsertVoterState(campaignId, voterId, state);

  // Moving away or dying is true for everyone canvassing the street.
  const person: Record<string, unknown> = {};
  if (result === "MOVED") person.movedAway = true;
  if (result === "DECEASED") person.deceased = true;
  if (Object.keys(person).length > 0) {
    await db.voter.update({ where: { id: voterId }, data: person });
  }

  if (wantsSign) await createSignRequestForVoter(campaignId, voterId);

  revalidatePath("/voters");
  revalidatePath(`/voters/${voterId}`);
  revalidatePath("/canvass");
  revalidatePath("/signs");
}

/* ------------------------------------------------------------------- turfs */

export async function createTurf(formData: FormData) {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const assignedToId = strOrNull(formData, "assignedToId");
  const turf = await db.turf.create({
    data: {
      campaignId: campaign.id,
      name: str(formData, "name") || "Untitled turf",
      description: str(formData, "description"),
      ward: str(formData, "ward"),
      assignedToId,
      status: assignedToId ? "ASSIGNED" : "UNASSIGNED",
    },
  });

  const streets = list(formData, "streets")
    .flatMap((s) => s.split(/[\n,]/))
    .map(canonicalStreet)
    .filter(Boolean);

  if (streets.length > 0) {
    await addHouseholdsByStreet(turf.id, campaign.municipalityId, streets);
  }

  revalidatePath("/canvass");
  redirect(`/canvass/${turf.id}`);
}

/** Put every household on the given streets into a turf. */
async function addHouseholdsByStreet(
  turfId: string,
  municipalityId: string,
  streetKeys: string[],
): Promise<number> {
  const households = await db.household.findMany({
    where: { municipalityId, streetKey: { in: streetKeys } },
    select: { id: true },
  });
  if (households.length === 0) return 0;

  // The SQLite connector has no skipDuplicates, so filter out the ones already
  // in this turf — re-adding a street should be harmless, not an error.
  const already = new Set(
    (
      await db.turfHousehold.findMany({
        where: { turfId, householdId: { in: households.map((h) => h.id) } },
        select: { householdId: true },
      })
    ).map((r) => r.householdId),
  );

  const fresh = households.filter((h) => !already.has(h.id));
  if (fresh.length > 0) {
    await db.turfHousehold.createMany({
      data: fresh.map((h) => ({ turfId, householdId: h.id })),
    });
  }
  return fresh.length;
}

export async function updateTurf(turfId: string, formData: FormData) {
  if (!(await requireOwned("turf", turfId))) return;

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
  if (!(await requireOwned("turf", turfId))) return;

  await db.turf.delete({ where: { id: turfId } });
  revalidatePath("/canvass");
  redirect("/canvass");
}

export async function addStreetToTurf(turfId: string, formData: FormData) {
  if (!(await requireOwned("turf", turfId))) return;

  const campaign = await getActiveCampaign();
  if (!campaign) return;

  const street = canonicalStreet(str(formData, "street"));
  if (!street) return;

  await addHouseholdsByStreet(turfId, campaign.municipalityId, [street]);
  revalidatePath(`/canvass/${turfId}`);
}

export async function removeHouseholdFromTurf(turfId: string, householdId: string) {
  if (!(await requireOwned("turf", turfId))) return;

  await db.turfHousehold.deleteMany({ where: { turfId, householdId } });
  revalidatePath(`/canvass/${turfId}`);
}

/* ------------------------------------------------------------ voter import */

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
 * Bulk-load a voters' list into the active campaign's municipality.
 *
 * Voters are shared by every campaign in the town, so a re-import updates the
 * shared record and leaves each campaign's own support levels and consent
 * untouched. Rows carrying an external id update in place rather than
 * duplicating.
 */
export async function importVoters(rows: ImportRow[]): Promise<ImportResult> {
  const campaign = await getActiveCampaign();
  if (!campaign) {
    return { created: 0, updated: 0, skipped: rows.length, households: 0, errors: ["No campaign selected"] };
  }
  // A bulk load rewrites the record every campaign in the town reads from.
  if (!(await requireCampaign(campaign.id, "MANAGER"))) {
    return { created: 0, updated: 0, skipped: rows.length, households: 0, errors: ["Manager access required"] };
  }
  const municipalityId = campaign.municipalityId;

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, households: 0, errors: [] };

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
          municipalityId,
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
        municipalityId,
      };

      const externalId = (row.externalId ?? "").trim();
      if (externalId) {
        const existing = await db.voter.findUnique({
          where: { municipalityId_externalId: { municipalityId, externalId } },
        });
        if (existing) {
          await db.voter.update({ where: { id: existing.id }, data });
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
 * Load a municipal civic address file into the active campaign's municipality.
 *
 * Separate from the voters' list import because the two answer different
 * questions: the address file is every door in the municipality, the voters'
 * list is the people entitled to vote at some of them. Loading addresses first
 * gives a complete map and true door counts; the voters' list then attaches
 * people to doors that already exist.
 */
export async function importAddresses(rows: AddressRow[]): Promise<AddressImportResult> {
  const campaign = await getActiveCampaign();
  if (!campaign) {
    return {
      created: 0,
      updated: 0,
      skipped: rows.length,
      withCoordinates: 0,
      errors: ["No campaign selected"],
    };
  }
  if (!(await requireCampaign(campaign.id, "MANAGER"))) {
    return {
      created: 0,
      updated: 0,
      skipped: rows.length,
      withCoordinates: 0,
      errors: ["Manager access required"],
    };
  }
  const municipalityId = campaign.municipalityId;

  const result: AddressImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    withCoordinates: 0,
    errors: [],
  };

  // Normalise the whole batch first, dropping anything unusable and collapsing
  // duplicates within the batch — a provincial address file repeats the odd
  // address, and two rows for one door should not race each other.
  type Prepared = {
    key: string;
    streetNumber: string;
    streetName: string;
    streetKey: string;
    unit: string;
    city: string;
    postalCode: string;
    ward: string;
    pollNumber: string;
    latitude: number | null;
    longitude: number | null;
  };

  const prepared = new Map<string, Prepared>();
  for (const row of rows) {
    const streetName = normaliseStreet(row.streetName ?? "");
    const streetNumber = (row.streetNumber ?? "").trim();
    if (streetName === "" || streetNumber === "") {
      result.skipped++;
      continue;
    }

    const streetKey = canonicalStreet(row.streetName ?? "");
    const unit = (row.unit ?? "").trim();
    const city = (row.city ?? "").trim();
    const key = `${streetKey}|${streetNumber}|${unit}|${city}`;
    if (prepared.has(key)) {
      result.skipped++;
      continue;
    }

    prepared.set(key, {
      key,
      streetNumber,
      streetName,
      streetKey,
      unit,
      city,
      postalCode: normalisePostal(row.postalCode ?? ""),
      ward: (row.ward ?? "").trim(),
      pollNumber: (row.pollNumber ?? "").trim(),
      latitude: toCoordinate(row.latitude, -90, 90),
      longitude: toCoordinate(row.longitude, -180, 180),
    });
  }

  if (prepared.size === 0) return result;

  // One lookup for the whole batch rather than one per row. A province-sized
  // file is imported a few hundred rows at a time, and per-row queries turn a
  // ten-thousand-door municipality into twenty thousand round trips.
  const candidates = await db.household.findMany({
    where: {
      municipalityId,
      streetKey: { in: Array.from(new Set([...prepared.values()].map((p) => p.streetKey))) },
    },
    select: {
      id: true,
      streetKey: true,
      streetNumber: true,
      unit: true,
      city: true,
      postalCode: true,
      ward: true,
      pollNumber: true,
      latitude: true,
      geocodeStatus: true,
    },
  });

  const existing = new Map(
    candidates.map((h) => [`${h.streetKey}|${h.streetNumber}|${h.unit}|${h.city}`, h]),
  );

  const fresh: Prepared[] = [];
  for (const item of prepared.values()) {
    const match = existing.get(item.key);
    if (!match) {
      fresh.push(item);
      continue;
    }

    // Fill gaps, never overwrite; and never move a pin someone placed by hand.
    const fill: Record<string, unknown> = {};
    if (item.postalCode && !match.postalCode) fill.postalCode = item.postalCode;
    if (item.ward && !match.ward) fill.ward = item.ward;
    if (item.pollNumber && !match.pollNumber) fill.pollNumber = item.pollNumber;
    if (
      item.latitude !== null &&
      item.longitude !== null &&
      match.latitude === null &&
      match.geocodeStatus !== "MANUAL"
    ) {
      fill.latitude = item.latitude;
      fill.longitude = item.longitude;
      fill.geocodeStatus = "OK";
      fill.geocodePrecision = "ROOFTOP";
      fill.geocodedAt = new Date();
    }

    if (Object.keys(fill).length > 0) {
      await db.household.update({ where: { id: match.id }, data: fill });
    }
    result.updated++;
    if (item.latitude !== null && item.longitude !== null) result.withCoordinates++;
  }

  if (fresh.length > 0) {
    try {
      await db.household.createMany({
        data: fresh.map((item) => ({
          municipalityId,
          streetNumber: item.streetNumber,
          streetName: item.streetName,
          streetKey: item.streetKey,
          unit: item.unit,
          city: item.city,
          postalCode: item.postalCode,
          ward: item.ward,
          pollNumber: item.pollNumber,
          latitude: item.latitude,
          longitude: item.longitude,
          // Address-point files are surveyed to the property, not interpolated.
          geocodeStatus: item.latitude !== null ? "OK" : "PENDING",
          geocodePrecision: item.latitude !== null ? "ROOFTOP" : "",
          geocodedAt: item.latitude !== null ? new Date() : null,
        })),
      });
      result.created += fresh.length;
      result.withCoordinates += fresh.filter((f) => f.latitude !== null).length;
    } catch (error) {
      result.skipped += fresh.length;
      result.errors.push(
        error instanceof Error ? error.message : "A batch of addresses could not be saved",
      );
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
