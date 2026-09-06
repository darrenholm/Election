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

    if (rough === 0) {
      console.log("  nothing to requeue");
      continue;
    }

    total += rough;

    if (apply) {
      await db.household.updateMany({
        where,
        data: {
          geocodeStatus: "PENDING",
          geocodePrecision: "",
          latitude: null,
          longitude: null,
        },
      });
      console.log(`  requeued ${rough.toLocaleString("en-CA")}`);
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
