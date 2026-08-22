"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { geocodeHouseholdBatch, geocodeSignBatch, type GeocodeRunResult } from "@/lib/geocode";
import { floatOrNull, str } from "@/lib/form";

/**
 * Geocode one batch of households. The map page calls this repeatedly so a
 * long run shows progress and can be stopped at any point — every batch is
 * committed before the next starts, so nothing is lost by walking away.
 */
export async function runHouseholdGeocode(limit = 50): Promise<GeocodeRunResult> {
  const result = await geocodeHouseholdBatch(limit);
  revalidatePath("/map");
  return result;
}

export async function runSignGeocode(limit = 50): Promise<GeocodeRunResult> {
  const result = await geocodeSignBatch(limit);
  revalidatePath("/map");
  revalidatePath("/signs");
  return result;
}

/**
 * Put failed addresses back in the queue — worth doing after fixing a batch of
 * typos, or once a billing problem on the Google key is sorted out. Hand-placed
 * pins are left alone.
 */
export async function retryFailedGeocodes() {
  await db.household.updateMany({
    where: { geocodeStatus: "FAILED" },
    data: { geocodeStatus: "PENDING" },
  });
  await db.signRequest.updateMany({
    where: { geocodeStatus: "FAILED" },
    data: { geocodeStatus: "PENDING" },
  });
  revalidatePath("/map");
}

/**
 * Place a household by hand. Marked MANUAL so a later geocoding run will not
 * replace a pin someone dropped from local knowledge with a worse guess.
 */
export async function setHouseholdLocation(householdId: string, formData: FormData) {
  const latitude = floatOrNull(formData, "latitude");
  const longitude = floatOrNull(formData, "longitude");

  if (latitude === null || longitude === null) return;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

  await db.household.update({
    where: { id: householdId },
    data: {
      latitude,
      longitude,
      geocodeStatus: "MANUAL",
      geocodePrecision: "ROOFTOP",
      geocodedAt: new Date(),
    },
  });

  revalidatePath("/map");
}

export async function setSignLocation(signId: string, formData: FormData) {
  const latitude = floatOrNull(formData, "latitude");
  const longitude = floatOrNull(formData, "longitude");

  if (latitude === null || longitude === null) return;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

  await db.signRequest.update({
    where: { id: signId },
    data: {
      latitude,
      longitude,
      geocodeStatus: "MANUAL",
      geocodePrecision: "ROOFTOP",
      geocodedAt: new Date(),
    },
  });

  revalidatePath("/map");
  revalidatePath("/signs");
}

/** Schedule a turf to be walked, which puts it on the map as an upcoming route. */
export async function setTurfPlannedDate(turfId: string, formData: FormData) {
  const raw = str(formData, "plannedFor");
  await db.turf.update({
    where: { id: turfId },
    data: { plannedFor: raw === "" ? null : new Date(raw) },
  });
  revalidatePath("/map");
  revalidatePath("/canvass");
  revalidatePath(`/canvass/${turfId}`);
}
