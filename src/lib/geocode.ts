import { db } from "./db";

/**
 * Address geocoding.
 *
 * Two providers, picked automatically:
 *
 *  - Google, if GOOGLE_GEOCODING_API_KEY is set. Best results on rural
 *    Ontario, charged per lookup after the monthly free credit.
 *  - Nominatim (OpenStreetMap), otherwise. Free, no account, no card, but
 *    capped at one lookup per second and thinner on concession roads and fire
 *    numbers than Google is.
 *
 * Either way the result carries a precision back to the database, the map
 * flags anything vaguer than an exact address, and a human can drop a pin by
 * hand. A hand-placed pin is marked MANUAL and is never overwritten by a later
 * re-run.
 */

type Provider = "google" | "nominatim";

const GOOGLE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

/**
 * Google asks for no more than 50 requests per second; 60ms is far under.
 * Nominatim's usage policy is an absolute maximum of one request per second,
 * so the free path is deliberately slow — a couple of thousand addresses is
 * most of an hour. The batch runner is built to be left alone and resumed.
 */
const SPACING_MS: Record<Provider, number> = { google: 60, nominatim: 1100 };

/** Nominatim requires an identifiable agent naming the application. */
const USER_AGENT = "ElectionManager/1.0 (+https://electionmgr.ca)";

/**
 * A batch has to finish inside one server action, so the free provider — at
 * better than a second per address — gets smaller batches than Google does.
 */
const MAX_BATCH: Record<Provider, number> = { google: 50, nominatim: 10 };

export type GeocodeOutcome =
  | { ok: true; latitude: number; longitude: number; precision: string; formatted: string }
  | { ok: false; reason: string };

function provider(): Provider {
  return process.env.GOOGLE_GEOCODING_API_KEY ? "google" : "nominatim";
}

/**
 * Geocoding always works now — without a Google key it falls back to the free
 * provider. Kept so callers can still ask, and so the map page can say which
 * one is in use.
 */
export function geocodingConfigured(): boolean {
  return true;
}

export function geocoderName(): "Google" | "OpenStreetMap" {
  return provider() === "google" ? "Google" : "OpenStreetMap";
}

/* -------------------------------------------------------------- throttling */

let lastRequestAt = 0;

/** Space every outbound lookup, whichever provider and however many tries. */
async function throttle(): Promise<void> {
  const gap = SPACING_MS[provider()];
  const wait = lastRequestAt + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/* ------------------------------------------------------------------ google */

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

async function geocodeWithGoogle(address: string): Promise<GeocodeOutcome> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return { ok: false, reason: "GOOGLE_GEOCODING_API_KEY is not set" };

  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  // Bias results to Canada so "Main St" does not land in Ohio.
  url.searchParams.set("region", "ca");
  url.searchParams.set("components", "country:CA");

  await throttle();

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

/* --------------------------------------------------------------- nominatim */

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  /** jsonv2 calls it `category`; older responses call it `class`. */
  category?: string;
  class?: string;
  type?: string;
  place_rank?: number;
  /** [minLat, maxLat, minLon, maxLon], as strings. */
  boundingbox?: string[];
  address?: { house_number?: string };
};

/** Structured query fields, or a free-form `q`. */
type NominatimQuery =
  | { street?: string; city?: string; state?: string; postalcode?: string }
  | { q: string };

async function nominatimSearch(
  query: NominatimQuery,
  viewbox?: string,
): Promise<NominatimResult[] | string> {
  const url = new URL(NOMINATIM_ENDPOINT);
  for (const [field, value] of Object.entries(query)) {
    if (value) url.searchParams.set(field, String(value));
  }
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("limit", "1");
  // Ontario reuses town names freely — there is a George Street in Durham,
  // Grey County and another in Durham Region, three hours away. Confining the
  // search to the municipality's own box is what stops a canvasser being sent
  // to the wrong one.
  if (viewbox) {
    url.searchParams.set("viewbox", viewbox);
    url.searchParams.set("bounded", "1");
  }

  await throttle();

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch (error) {
    return error instanceof Error ? error.message : "Network error";
  }

  if (response.status === 429) return "OpenStreetMap asked us to slow down";
  if (!response.ok) return `OpenStreetMap returned HTTP ${response.status}`;

  try {
    return (await response.json()) as NominatimResult[];
  } catch {
    return "Unreadable response";
  }
}

/**
 * Translate an OpenStreetMap hit into the same precision words Google uses, so
 * the map flags rough pins the same way whichever provider found them.
 *
 * `expectedNumber` is the house number we asked for. If the answer came back
 * without it, or with a different one, we have been given the street rather
 * than the house and should say so.
 */
function nominatimPrecision(hit: NominatimResult, expectedNumber?: string): string {
  // Address interpolation: a guess along a range, not a surveyed point.
  // ("houses", plural — a real address point comes back as "house".)
  const category = hit.category ?? hit.class;
  if (category === "place" && hit.type === "houses") return "RANGE_INTERPOLATED";

  const rank = hit.place_rank ?? 0;
  const gotNumber = (hit.address?.house_number ?? "").trim();

  if (rank >= 30 && gotNumber !== "") {
    if (!expectedNumber) return "ROOFTOP";
    return gotNumber.toLowerCase() === expectedNumber.trim().toLowerCase()
      ? "ROOFTOP"
      : "GEOMETRIC_CENTER";
  }

  // 26–27 is a road; anything less is a settlement or postal area.
  if (rank >= 26) return "GEOMETRIC_CENTER";
  return "APPROXIMATE";
}

/**
 * The bounding box of a municipality, looked up once and remembered for the
 * life of the process. One extra lookup per municipality per run is a cheap
 * price for keeping every address inside the right township.
 */
const municipalityBoxes = new Map<string, string | null>();

async function municipalityViewbox(name: string): Promise<string | undefined> {
  const key = name.trim();
  if (key === "") return undefined;

  if (!municipalityBoxes.has(key)) {
    const hits = await nominatimSearch({ q: `${key}, Ontario, Canada` });
    const box = typeof hits === "string" ? undefined : hits[0]?.boundingbox;
    // Nominatim gives [minLat, maxLat, minLon, maxLon]; viewbox wants
    // lon,lat,lon,lat.
    municipalityBoxes.set(
      key,
      box && box.length === 4 ? `${box[2]},${box[0]},${box[3]},${box[1]}` : null,
    );
  }

  return municipalityBoxes.get(key) ?? undefined;
}

/**
 * Try the structured query first — it is far more reliable than a single
 * string — then loosen it. The postal code is dropped before the street is,
 * because a stale postal code is the more common reason a real address fails.
 */
async function geocodeWithNominatim(
  parts: AddressParts,
  freeform: string,
): Promise<GeocodeOutcome> {
  const viewbox = await municipalityViewbox(parts.municipality);
  const street = [parts.streetNumber, parts.streetName].filter(Boolean).join(" ").trim();

  const cached = cachedRoad(parts);
  if (cached) return cached;

  // The town on a rural row is where the post is delivered, not where the
  // house is: half of West Grey collects its mail in Hanover, which is a
  // different municipality. Sending that as `city` made OpenStreetMap return
  // nothing at all, so the municipality's bounding box does the narrowing
  // instead and the town is left out.
  const attempts: NominatimQuery[] = [];
  if (street !== "") {
    if (parts.postalCode.trim() !== "") {
      attempts.push({ street, state: "Ontario", postalcode: parts.postalCode });
    }
    attempts.push({ street, state: "Ontario" });
  }
  attempts.push({ q: freeform });

  let lastError = "No match";

  for (const attempt of attempts) {
    const hits = await nominatimSearch(attempt, viewbox);

    if (typeof hits === "string") {
      lastError = hits;
      continue;
    }
    const best = hits[0];
    if (!best) continue;

    const lat = Number(best.lat);
    const lng = Number(best.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const precision = nominatimPrecision(best, parts.streetNumber);
    const outcome: GeocodeOutcome = {
      ok: true,
      latitude: lat,
      longitude: lng,
      precision,
      formatted: best.display_name ?? "",
    };
    rememberRoad(parts, outcome);
    return outcome;
  }

  return { ok: false, reason: lastError };
}

/* ------------------------------------------------- learning a road is bare */

/**
 * OpenStreetMap has the concession roads and sideroads of rural Ontario but
 * almost none of the fire numbers along them, so every house on 10th Sideroad
 * comes back as the road itself. Once three houses in a row on the same road
 * have answered that way, we stop asking: the rest of that road is given the
 * same point, marked as a rough location, at no cost in lookups.
 *
 * That is the difference between eleven hours and half of one on a list this
 * size, and it loses nothing — a road-centre pin was all the next thousand
 * lookups were ever going to return.
 */
type Road = { latitude: number; longitude: number; formatted: string; misses: number };

const roads = new Map<string, Road>();

/** Three in a row is enough to call it; one odd address is not. */
const BARE_ROAD_AFTER = 3;

function roadKey(parts: AddressParts): string {
  return `${parts.municipality}|${parts.streetName.trim().toLowerCase()}`;
}

function cachedRoad(parts: AddressParts): GeocodeOutcome | null {
  const road = roads.get(roadKey(parts));
  if (!road || road.misses < BARE_ROAD_AFTER) return null;

  return {
    ok: true,
    latitude: road.latitude,
    longitude: road.longitude,
    precision: "GEOMETRIC_CENTER",
    formatted: road.formatted,
  };
}

function rememberRoad(parts: AddressParts, outcome: GeocodeOutcome): void {
  if (!outcome.ok || parts.streetName.trim() === "") return;

  const key = roadKey(parts);

  // A real house number on this road means the road is mapped after all, so
  // forget any earlier run of misses and keep asking.
  if (outcome.precision === "ROOFTOP" || outcome.precision === "RANGE_INTERPOLATED") {
    roads.delete(key);
    return;
  }

  // Only a genuine road centre is worth reusing. APPROXIMATE is a village or a
  // postal district, which says nothing about where this road runs.
  if (outcome.precision !== "GEOMETRIC_CENTER") return;

  const previous = roads.get(key);
  roads.set(key, {
    latitude: outcome.latitude,
    longitude: outcome.longitude,
    formatted: outcome.formatted,
    misses: (previous?.misses ?? 0) + 1,
  });
}

/* -------------------------------------------------------------- public api */

type AddressParts = {
  streetNumber: string;
  streetName: string;
  city: string;
  postalCode: string;
  /** The municipality the address belongs to, used to bound the search. */
  municipality: string;
};

const EMPTY_PARTS: AddressParts = {
  streetNumber: "",
  streetName: "",
  city: "",
  postalCode: "",
  municipality: "",
};

/**
 * Geocode one address. Pass the pieces separately when you have them — the
 * free provider does markedly better with a structured query than with one
 * long string.
 */
export async function geocodeAddress(
  address: string,
  parts: AddressParts = EMPTY_PARTS,
): Promise<GeocodeOutcome> {
  if (address.trim() === "") return { ok: false, reason: "Empty address" };

  return provider() === "google"
    ? geocodeWithGoogle(address)
    : geocodeWithNominatim(parts, address);
}

/** Build the one-line address string for a household. */
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
    take: Math.min(limit, MAX_BATCH[provider()]),
    orderBy: { streetName: "asc" },
    include: { municipality: { select: { name: true } } },
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
    const outcome = await geocodeAddress(householdAddress(household), {
      streetNumber: household.streetNumber,
      streetName: household.streetName,
      city: household.city,
      postalCode: household.postalCode,
      municipality: household.municipality.name,
    });

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
    take: Math.min(limit, MAX_BATCH[provider()]),
    include: {
      campaign: { select: { municipality: { select: { name: true } } } },
    },
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

    // A typed line is "123 Main St" more often than not, so split the leading
    // number off for the structured query and let it fall back if it is not.
    const match = /^\s*(\d+[A-Za-z]?)\s+(.*)$/.exec(sign.addressLine);
    const outcome = await geocodeAddress(address, {
      streetNumber: match?.[1] ?? "",
      streetName: match?.[2] ?? sign.addressLine,
      city: sign.city,
      postalCode: sign.postalCode,
      municipality: sign.campaign.municipality.name,
    });

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
  }

  result.remaining = await db.signRequest.count({
    where: { geocodeStatus: "PENDING", NOT: { addressLine: "" } },
  });

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
