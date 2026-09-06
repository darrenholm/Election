/**
 * Put loosely-placed households back in the geocoding queue.
 *
 * Google does not report a street it cannot find. It answers with the middle
 * of the town on the envelope instead, at full confidence. Because a West Grey
 * voters' list carries postal delivery towns — Hanover, Elmwood, Chesley, Owen
 * Sound, Kincardine, and one row that simply reads Waterloo — the first run
 * scattered pins across half of Grey and Bruce, up to eighty kilometres
 * outside the municipality.
 *
 * The geocoder now refuses an answer whose municipality is not the one asked
 * for. This clears the pins placed before it learned to, so they can be looked
 * up again and either land properly or be reported as not found.
 *
 * ROOFTOP and RANGE_INTERPOLATED are left alone: those are real addresses
 * Google actually located, and re-running them would cost lookups to arrive at
 * the same answer. Only the vague ones go back — GEOMETRIC_CENTER (the middle
 * of a road) and APPROXIMATE (the middle of a town), which are exactly the
 * ones the map already flags as rough.
 *
 * Hand-placed pins are never touched. MANUAL means somebody who knows the
 * concession put that pin where it belongs.
 *
 * Reports and changes nothing until you add --apply:
 *
 *   npx tsx scripts/requeue-rough-geocodes.ts
 *   npx tsx scripts/requeue-rough-geocodes.ts --municipality "West Grey" --apply
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

/** The precisions worth looking up again. Anything else is trusted. */
const ROUGH = ["GEOMETRIC_CENTER", "APPROXIMATE", ""];

/**
 * Precision is not the only way to be wrong. Google will report a street it
 * found in another town at full ROOFTOP confidence — "115 George Street,
 * Durham" resolves exactly, in Durham Region, three hours away — and those
 * pins survived the first pass because nothing about them looked vague.
 *
 * So also take anything sitting outside the municipality's own bounding box.
 * The box comes from OpenStreetMap, is free, and is asked for once.
 */
const MARGIN_DEGREES = 0.03; // roughly 3km, for a house just over the line

type Box = { minLat: number; maxLat: number; minLon: number; maxLon: number };

async function municipalityBox(name: string): Promise<Box | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${name}, Ontario, Canada`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": "ElectionManager/1.0 (+https://electionmgr.ca)" },
  });
  if (!response.ok) return null;

  const hit = (await response.json())[0] as { boundingbox?: string[] } | undefined;
  const box = hit?.boundingbox;
  if (!box || box.length !== 4) return null;

  // Nominatim orders it [minLat, maxLat, minLon, maxLon].
  return {
    minLat: Number(box[0]) - MARGIN_DEGREES,
    maxLat: Number(box[1]) + MARGIN_DEGREES,
    minLon: Number(box[2]) - MARGIN_DEGREES,
    maxLon: Number(box[3]) + MARGIN_DEGREES,
  };
}

async function main() {
  const municipalities = await db.municipality.findMany({
    where: wanted.length > 0 ? { name: { in: wanted } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (municipalities.length === 0) {
    console.log("No matching municipality.");
    return;
  }

  let total = 0;

  for (const municipality of municipalities) {
    const where = {
      municipalityId: municipality.id,
      geocodeStatus: "OK",
      geocodePrecision: { in: ROUGH },
    };

    const byPrecision = await db.household.groupBy({
      by: ["geocodePrecision"],
      where,
      _count: { _all: true },
    });

    const rough = byPrecision.reduce((sum, row) => sum + row._count._all, 0);
    const placed = await db.household.count({
      where: { municipalityId: municipality.id, geocodeStatus: "OK" },
    });

    console.log(`\n${municipality.name}: ${placed.toLocaleString("en-CA")} placed`);
    for (const row of byPrecision) {
      const label = row.geocodePrecision === "" ? "(none recorded)" : row.geocodePrecision;
      console.log(`  ${label.padEnd(18)} ${row._count._all.toLocaleString("en-CA")}`);
    }

    // Anything placed outside the municipality, however confidently.
    const box = await municipalityBox(municipality.name);
    let strays: string[] = [];

    if (box === null) {
      console.log("  (could not read this municipality's boundary — skipping the distance check)");
    } else {
      const outside = await db.household.findMany({
        where: {
          municipalityId: municipality.id,
          geocodeStatus: "OK",
          geocodePrecision: { notIn: ROUGH },
          OR: [
            { latitude: { lt: box.minLat } },
            { latitude: { gt: box.maxLat } },
            { longitude: { lt: box.minLon } },
            { longitude: { gt: box.maxLon } },
          ],
        },
        select: { id: true, streetNumber: true, streetName: true, city: true },
      });

      strays = outside.map((h) => h.id);
      console.log(`  outside the municipality  ${outside.length.toLocaleString("en-CA")}`);
      for (const h of outside.slice(0, 5)) {
        console.log(`    e.g. ${h.streetNumber} ${h.streetName}, ${h.city}`.replace(/\s+/g, " "));
      }
    }

    if (rough === 0 && strays.length === 0) {
      console.log("  nothing to requeue");
      continue;
    }

    total += rough + strays.length;

    if (apply) {
      const cleared = {
        geocodeStatus: "PENDING",
        geocodePrecision: "",
        latitude: null,
        longitude: null,
      };
      await db.household.updateMany({ where, data: cleared });
      if (strays.length > 0) {
        await db.household.updateMany({ where: { id: { in: strays } }, data: cleared });
      }
      console.log(`  requeued ${(rough + strays.length).toLocaleString("en-CA")}`);
    }
  }

  console.log(
    apply
      ? `\nDone. ${total.toLocaleString("en-CA")} back in the queue — run the geocoder again.`
      : `\nDry run. ${total.toLocaleString("en-CA")} would be requeued. Add --apply to do it.`,
  );
  console.log("Each one costs a Google lookup; the first 10,000 a month are free.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
