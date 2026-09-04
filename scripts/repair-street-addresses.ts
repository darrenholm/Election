/**
 * Split the civic number off the front of a household's street name.
 *
 * West Grey's import put the whole address into streetName and left
 * streetNumber empty, so every door became its own street:
 *
 *   streetNumber ""   streetName "242 Chester St W"
 *   streetNumber ""   streetName "231764 Conc 2 Wgr"
 *
 * 5,774 "streets" for 6,002 doors, which makes street coverage, turf building
 * and the run sheets meaningless — each is grouped by street.
 *
 * Rural lot descriptions ("Con 3 Lot 47 W Pt Lot 48") have no civic number and
 * are left exactly as they are. So is anything else that does not begin with a
 * number: a name this script cannot read is not one it should guess at.
 *
 * Reports and changes nothing until you add --apply:
 *
 *   npx tsx scripts/repair-street-addresses.ts --municipality <id>
 *   npx tsx scripts/repair-street-addresses.ts --municipality <id> --apply
 */
import { PrismaClient } from "@prisma/client";
import { canonicalStreet, normaliseStreet } from "../src/lib/address";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

/**
 * "242 Chester St W" -> { number: "242", street: "Chester St W" }
 *
 * Accepts the shapes a civic address actually takes: a plain number, a number
 * with a unit letter (12A), and a range (242-244). Anything else returns null
 * and is left alone.
 */
function splitCivicNumber(value: string): { number: string; street: string } | null {
  const m = /^(\d+(?:-\d+)?[A-Za-z]?)\s+(\S.*)$/.exec(value.trim());
  if (!m) return null;
  const street = m[2].trim();
  // A "street" that is only punctuation or a stray digit is not a street.
  if (!/[A-Za-z]/.test(street)) return null;
  return { number: m[1], street };
}

async function main() {
  const municipalities = await db.municipality.findMany({ orderBy: { name: "asc" } });
  const targets = wanted.length
    ? municipalities.filter((m) =>
        wanted.some((w) => w === m.id || w.toLowerCase() === m.name.toLowerCase()),
      )
    : municipalities;

  if (targets.length === 0) {
    console.log("No municipality matched. On file:");
    for (const m of municipalities) console.log(`  ${m.name}  (${m.id})`);
    return;
  }

  console.log(apply ? "APPLYING CHANGES\n" : "DRY RUN — nothing will be written\n");

  for (const m of targets) {
    const households = await db.household.findMany({
      where: { municipalityId: m.id },
      select: { id: true, streetNumber: true, streetName: true, streetKey: true, unit: true, city: true },
    });

    const streetsBefore = new Set(households.map((h) => h.streetKey)).size;

    const candidates = households.filter((h) => h.streetNumber.trim() === "");
    const splittable: {
      id: string;
      before: string;
      number: string;
      street: string;
      key: string;
    }[] = [];
    const leftAlone: string[] = [];

    for (const h of candidates) {
      const split = splitCivicNumber(h.streetName);
      if (!split) {
        leftAlone.push(h.streetName);
        continue;
      }
      splittable.push({
        id: h.id,
        before: h.streetName,
        number: split.number,
        street: normaliseStreet(split.street),
        key: canonicalStreet(split.street),
      });
    }

    // What the street list looks like afterwards, so the win is visible before
    // anything is written.
    const keysAfter = new Set(
      households.map((h) => {
        const fixed = splittable.find((s) => s.id === h.id);
        return fixed ? fixed.key : h.streetKey;
      }),
    );

    console.log(`${m.name} — ${households.length.toLocaleString("en-CA")} households`);
    console.log(`  street number already set:   ${(households.length - candidates.length).toLocaleString("en-CA")}`);
    console.log(`  number to split off the name: ${splittable.length.toLocaleString("en-CA")}`);
    console.log(`  no civic number, left as is:  ${leftAlone.length.toLocaleString("en-CA")}`);
    console.log(
      `  distinct streets: ${streetsBefore.toLocaleString("en-CA")} -> ${keysAfter.size.toLocaleString("en-CA")}`,
    );

    if (splittable.length > 0) {
      console.log("  examples of the change:");
      for (const s of splittable.slice(0, 8)) {
        console.log(`    "${s.before}"  ->  ${s.number} | ${s.street}   [key ${s.key}]`);
      }
    }
    if (leftAlone.length > 0) {
      console.log("  examples left alone:");
      for (const value of leftAlone.slice(0, 8)) console.log(`    "${value}"`);
    }

    // After the split two rows can describe the same door. Nothing here merges
    // them — that moves voters between households and is a separate decision —
    // but a silent duplicate is worse than a counted one.
    const seen = new Map<string, number>();
    for (const h of households) {
      const fixed = splittable.find((s) => s.id === h.id);
      const key = [fixed?.key ?? h.streetKey, fixed?.number ?? h.streetNumber, h.unit, h.city].join("|");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicated = [...seen.values()].filter((n) => n > 1).length;
    console.log(`  addresses that would end up with more than one record: ${duplicated.toLocaleString("en-CA")}`);

    if (!apply) {
      console.log("");
      continue;
    }

    let done = 0;
    for (const s of splittable) {
      await db.household.update({
        where: { id: s.id },
        data: { streetNumber: s.number, streetName: s.street, streetKey: s.key },
      });
      done++;
      if (done % 1000 === 0) console.log(`    ${done.toLocaleString("en-CA")}…`);
    }
    console.log(`\n  repaired ${done.toLocaleString("en-CA")} households\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
