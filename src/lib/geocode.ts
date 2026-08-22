import { db } from "./db";

/**
 * Address geocoding through the Google Geocoding API.
 *
 * Rural Ontario is exactly where free geocoders struggle — concession roads,
 * rural routes and fire numbers often resolve only to the middle of a road, or
 * not at all. So every result carries Google's `location_type` through to the
 * database, the map flags anything vaguer than a rooftop match, and a human can
 * drop a pin by hand. A hand-placed pin is marked MANUAL and is never
 * overwritten by a later re-run.
 *
 * Set GOOGLE_GEOCODING_API_KEY to enable. Without it the geocoder reports that
 * it is unconfigured rather than silently doing nothing.
 */

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/** Google asks for no more than 50 requests per second; this is far under. */
const REQUEST_SPACING_MS = 60;

export type GeocodeOutcome =
  | { ok: true; latitude: number; longitude: number; precision: string; formatted: string }
  | { ok: false; reason: string };

export function geocodingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GEOCODING_API_KEY);
}

type GoogleResponse = {
  status: string;
  error_message?: string;
  results?: {
    formatted_address?: string;
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
  }[];
};

/** Geocode one free-form address string. */
export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return { ok: false, reason: "GOOGLE_GEOCODING_API_KEY is not set" };
  if (address.trim() === "") return { ok: false, reason: "Empty address" };

  const url = new URL(ENDPOINT);
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  // Bias results to Canada so "Main St" does not land in Ohio.
  url.searchParams.set("region", "ca");
  url.searchParams.set("components", "country:CA");

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Network error" };
  }

  if (!response.ok) {
    return { ok: false, reason: `Google returned HTTP ${response.status}` };
  }

  const data = (await response.json()) as GoogleResponse;

  // ZERO_RESULTS is a normal answer for a rural address, not a fault.
  if (data.status === "ZERO_RESULTS") return { ok: false, reason: "No match" };
  if (data.status !== "OK") {
    return { ok: false, reason: data.error_message || data.status };
  }

  const best = data.results?.[0];
  const lat = best?.geometry?.location?.lat;
  const lng = best?.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return { ok: false, reason: "Response had no coordinates" };
  }

  return {
    ok: true,
    latitude: lat,
    longitude: lng,
    precision: best?.geometry?.location_type ?? "",
    formatted: best?.formatted_address ?? "",
  };
}

/** Build the one-line address string sent to Google for a household. */
export function householdAddress(household: {
  streetNumber: string;
  streetName: string;
  city: string;
  postalCode: string;
}): string {
  // The unit is deliberately left out: apartment numbers confuse the geocoder
  // and every unit in a building shares the same point anyway.
  const street = [household.streetNumber, household.streetName].filter(Boolean).join(" ");
  return [street, household.city, "Ontario", household.postalCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export type GeocodeRunResult = {
  attempted: number;
  located: number;
  failed: number;
  remaining: number;
  errors: string[];
};

/**
 * Geocode a batch of households that have not been placed yet. Runs in
 * batches rather than all at once so a run can be watched, stopped and
 * resumed — 2,000 rural addresses is a long job and nobody should have to hold
 * a browser tab open for all of it in one go.
 */
export async function geocodeHouseholdBatch(limit = 50): Promise<GeocodeRunResult> {
  const pending = await db.household.findMany({
    where: { geocodeStatus: "PENDING", NOT: { streetName: "" } },
    take: limit,
    orderBy: { streetName: "asc" },
  });

  const result: GeocodeRunResult = {
    attempted: 0,
    located: 0,
    failed: 0,
    remaining: 0,
    errors: [],
  };

  for (const household of pending) {
    result.attempted++;
    const outcome = await geocodeAddress(householdAddress(household));

    if (outcome.ok) {
      await db.household.update({
        where: { id: household.id },
        data: {
          latitude: outcome.latitude,
          longitude: outcome.longitude,
          geocodeStatus: "OK",
          geocodePrecision: outcome.precision,
          geocodedAt: new Date(),
        },
      });
      result.located++;
    } else {
      await db.household.update({
        where: { id: household.id },
        data: { geocodeStatus: "FAILED", geocodedAt: new Date() },
      });
      result.failed++;
      if (result.errors.length < 10) {
        result.errors.push(`${householdAddress(household)} — ${outcome.reason}`);
      }
    }

    await sleep(REQUEST_SPACING_MS);
  }

  result.remaining = await db.household.count({
    where: { geocodeStatus: "PENDING", NOT: { streetName: "" } },
  });

  return result;
}

/** The same, for sign requests, whose addresses are typed free-form. */
export async function geocodeSignBatch(limit = 50): Promise<GeocodeRunResult> {
  const pending = await db.signRequest.findMany({
    where: { geocodeStatus: "PENDING", NOT: { addressLine: "" } },
    take: limit,
  });

  const result: GeocodeRunResult = {
    attempted: 0,
    located: 0,
    failed: 0,
    remaining: 0,
    errors: [],
  };

  for (const sign of pending) {
    result.attempted++;
    const address = [sign.addressLine, sign.city, "Ontario", sign.postalCode]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ");
    const outcome = await geocodeAddress(address);

    if (outcome.ok) {
      await db.signRequest.update({
        where: { id: sign.id },
        data: {
          latitude: outcome.latitude,
          longitude: outcome.longitude,
          geocodeStatus: "OK",
          geocodePrecision: outcome.precision,
          geocodedAt: new Date(),
        },
      });
      result.located++;
    } else {
      await db.signRequest.update({
        where: { id: sign.id },
        data: { geocodeStatus: "FAILED", geocodedAt: new Date() },
      });
      result.failed++;
      if (result.errors.length < 10) result.errors.push(`${address} — ${outcome.reason}`);
    }

    await sleep(REQUEST_SPACING_MS);
  }

  result.remaining = await db.signRequest.count({
    where: { geocodeStatus: "PENDING", NOT: { addressLine: "" } },
  });

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
