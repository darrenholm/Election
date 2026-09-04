/**
 * Split "SURNAME, GIVEN NAMES" out of firstName into real columns.
 *
 * West Grey's import put the entire name string — surname, comma and given
 * names — into firstName and left lastName empty on all 12,124 rows:
 *
 *   firstName "WHALEN, ANN"                     lastName ""
 *   firstName "SHEWFELT, CASEY ORVILLE MCLEAN"  lastName ""
 *
 * This is NOT the fault repair-voter-names.ts --split-first-names handles.
 * That one assumes firstName holds given names only and splits on the first
 * space, which here would produce firstName "WHALEN," — surname, comma and
 * all. Do not run it on this data.
 *
 * The comma is the reliable divider: everything before it is the surname,
 * the first word after it is the given name, the rest are middle names.
 *
 *   npx tsx scripts/repair-comma-names.ts --municipality "West Grey"
 *   npx tsx scripts/repair-comma-names.ts --municipality "West Grey" --apply
 *
 * Only rows with an empty lastName and exactly one comma in firstName are
 * touched. Anything else is counted and left alone — a row that has already
 * been repaired, or one shaped differently, is not something to guess at.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

type Split = { firstName: string; middleName: string; lastName: string };

/** "SHEWFELT, CASEY ORVILLE MCLEAN" -> last SHEWFELT, first CASEY, middle "ORVILLE MCLEAN" */
function splitCommaName(value: string): Split | null {
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const lastName = parts[0].trim();
  const given = parts[1].trim().split(/\s+/).filter(Boolean);
  if (lastName === "" || given.length === 0) return null;
  return {
    lastName,
    firstName: given[0],
    middleName: given.slice(1).join(" "),
  };
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
    const voters = await db.voter.findMany({
      where: { municipalityId: m.id },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    });

    const candidates = voters.filter((v) => v.lastName.trim() === "");
    const splittable: { id: string; split: Split; before: string }[] = [];
    const unparsed: string[] = [];

    for (const v of candidates) {
      const split = splitCommaName(v.firstName);
      if (split) splittable.push({ id: v.id, split, before: v.firstName });
      else unparsed.push(v.firstName);
    }

    console.log(`${m.name} — ${voters.length.toLocaleString("en-CA")} voters`);
    console.log(`  empty Last name:        ${candidates.length.toLocaleString("en-CA")}`);
    console.log(`  splittable on a comma:  ${splittable.length.toLocaleString("en-CA")}`);
    console.log(`  left alone (no single comma): ${unparsed.length.toLocaleString("en-CA")}`);

    for (const value of unparsed.slice(0, 10)) console.log(`      "${value}"`);

    if (splittable.length > 0) {
      console.log("  examples of the change:");
      for (const s of splittable.slice(0, 8)) {
        console.log(
          `    "${s.before}"  ->  last "${s.split.lastName}" ` +
            `first "${s.split.firstName}" middle "${s.split.middleName}"`,
        );
      }
    }

    if (!apply) {
      console.log("");
      continue;
    }

    let done = 0;
    for (const s of splittable) {
      await db.voter.update({ where: { id: s.id }, data: s.split });
      done++;
      if (done % 2000 === 0) console.log(`    ${done.toLocaleString("en-CA")}…`);
    }
    console.log(`\n  repaired ${done.toLocaleString("en-CA")} rows\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
