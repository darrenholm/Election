/**
 * Put mis-imported voter names back where they belong.
 *
 * Two faults, both from the CSV import's column guessing:
 *
 *   1. "Middle Name" normalised to "middlename", which contains "id", so the
 *      old substring match handed that column to List ID. Middle names ended
 *      up in Voter.externalId (Brockton).
 *   2. There was no middle-name field at all, so a list with the given names
 *      in one column put "David Edward William" in firstName (West Grey).
 *
 * Run it against the deployment's database. It reports and changes nothing
 * until you add --apply:
 *
 *   DATABASE_URL="postgresql://..." npx tsx scripts/repair-voter-names.ts
 *   DATABASE_URL="postgresql://..." npx tsx scripts/repair-voter-names.ts --apply
 *
 * Flags:
 *   --municipality "West Grey"   limit to one town (name or id, repeatable)
 *   --split-first-names          also split "David Edward William" in firstName
 *                                into firstName + middleName
 *   --apply                      actually write
 *
 * Take a database backup first. What this CANNOT do is bring back voters lost
 * to the second fault of bug 1: externalId is unique per municipality, and the
 * importer treats a match as "already on file" and updates it. Two people with
 * the same middle name in one town meant the second overwrote the first. The
 * report counts how many rows that hit; recovering them means re-importing the
 * clerk's list after this script has cleared the bogus IDs.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const splitFirstNames = argv.includes("--split-first-names");
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

/** A list ID has digits in it. Anything that is only letters is a name. */
function looksLikeAName(value: string): boolean {
  const v = value.trim();
  if (v === "") return false;
  return /[A-Za-z]/.test(v) && !/[0-9]/.test(v);
}

function splitGivenNames(first: string): { firstName: string; middleName: string } {
  const parts = first.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", middleName: parts.slice(1).join(" ") };
}

async function main() {
  const municipalities = await db.municipality.findMany({
    orderBy: { name: "asc" },
  });
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
      select: { id: true, externalId: true, firstName: true, middleName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const nameInId = voters.filter((v) => looksLikeAName(v.externalId ?? ""));
    const multiFirst = voters.filter(
      (v) => v.middleName.trim() === "" && /\s/.test(v.firstName.trim()),
    );

    console.log(`${m.name} — ${voters.length.toLocaleString("en-CA")} voters`);
    console.log(`  names sitting in the List ID field: ${nameInId.length.toLocaleString("en-CA")}`);
    console.log(`  given names run together in First name: ${multiFirst.length.toLocaleString("en-CA")}`);

    if (nameInId.length > 0) {
      const distinct = new Set(nameInId.map((v) => (v.externalId ?? "").trim().toUpperCase()));
      const lost = nameInId.length - distinct.size;
      for (const v of nameInId.slice(0, 5)) {
        console.log(`    e.g. ${v.lastName}, ${v.firstName} | List ID = "${v.externalId}"`);
      }
      console.log(
        `    ${distinct.size.toLocaleString("en-CA")} distinct values — at least ` +
          `${Math.max(0, lost).toLocaleString("en-CA")} rows were overwritten during import ` +
          `and need re-importing afterwards.`,
      );
    }
    if (splitFirstNames && multiFirst.length > 0) {
      for (const v of multiFirst.slice(0, 5)) {
        const s = splitGivenNames(v.firstName);
        console.log(`    e.g. "${v.firstName}" -> first "${s.firstName}" middle "${s.middleName}"`);
      }
    }

    if (!apply) {
      console.log("");
      continue;
    }

    let moved = 0;
    for (const v of nameInId) {
      const middle = (v.externalId ?? "").trim();
      await db.voter.update({
        where: { id: v.id },
        // externalId goes back to null so the unique key stops matching on a
        // name, and a later re-import can set the real list ID.
        data: { middleName: v.middleName.trim() === "" ? middle : v.middleName, externalId: null },
      });
      moved++;
    }

    let split = 0;
    if (splitFirstNames) {
      // Re-read: the pass above may have filled middleName on some of these.
      const rows = await db.voter.findMany({
        where: { municipalityId: m.id },
        select: { id: true, firstName: true, middleName: true },
      });
      for (const v of rows) {
        if (v.middleName.trim() !== "") continue;
        if (!/\s/.test(v.firstName.trim())) continue;
        const s = splitGivenNames(v.firstName);
        await db.voter.update({ where: { id: v.id }, data: s });
        split++;
      }
    }

    console.log(`  moved ${moved.toLocaleString("en-CA")} names out of List ID`);
    if (splitFirstNames) console.log(`  split ${split.toLocaleString("en-CA")} given-name fields`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
