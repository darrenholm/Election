/**
 * Report what is actually sitting in a municipality's name columns.
 *
 * West Grey shows 12,124 of 12,124 voters with a space in firstName, which no
 * real population produces — every elector having two given names is not a
 * thing. So firstName holds something other than a plain first name, and until
 * we know what, running the repair script's --split-first-names there would
 * rewrite all 12,124 rows on a guess.
 *
 * Read-only. There is no --apply; this script cannot write.
 *
 *   npx tsx scripts/inspect-name-shape.ts --municipality "West Grey"
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

function tally<T extends string | number>(values: T[]): [T, number][] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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

  for (const m of targets) {
    const voters = await db.voter.findMany({
      where: { municipalityId: m.id },
      select: { firstName: true, middleName: true, lastName: true, externalId: true },
    });

    console.log(`\n${m.name} — ${voters.length.toLocaleString("en-CA")} voters`);

    // How many words are in firstName? A normal list is overwhelmingly 1.
    const wordCounts = tally(
      voters.map((v) => (v.firstName.trim() === "" ? 0 : v.firstName.trim().split(/\s+/).length)),
    ).sort((a, b) => Number(a[0]) - Number(b[0]));
    console.log("  words in First name:");
    for (const [words, n] of wordCounts) {
      const pct = ((n / voters.length) * 100).toFixed(1);
      console.log(`    ${words} word(s): ${n.toLocaleString("en-CA")}  (${pct}%)`);
    }

    // Does the tail of firstName repeat like initials, or vary like names?
    const tails = voters
      .map((v) => v.firstName.trim().split(/\s+/).slice(1).join(" "))
      .filter((t) => t !== "");
    if (tails.length > 0) {
      const distinct = new Set(tails).size;
      console.log(
        `  text after the first word: ${tails.length.toLocaleString("en-CA")} rows, ` +
          `${distinct.toLocaleString("en-CA")} distinct`,
      );
      const single = tails.filter((t) => t.replace(/\./g, "").length === 1).length;
      console.log(`    single letters (initials): ${single.toLocaleString("en-CA")}`);
      console.log("    most common:");
      for (const [value, n] of tally(tails).slice(0, 12)) {
        console.log(`      "${value}"  ×${n.toLocaleString("en-CA")}`);
      }
    }

    // Does the tail ever equal the surname? That would mean firstName holds the
    // whole name, and splitting it would be flatly wrong.
    const tailIsLastName = voters.filter((v) => {
      const parts = v.firstName.trim().split(/\s+/);
      if (parts.length < 2) return false;
      return parts[parts.length - 1].toUpperCase() === v.lastName.trim().toUpperCase();
    }).length;
    console.log(`  rows whose First name ends with the surname: ${tailIsLastName.toLocaleString("en-CA")}`);

    const withMiddle = voters.filter((v) => v.middleName.trim() !== "").length;
    const withExternal = voters.filter((v) => (v.externalId ?? "").trim() !== "").length;
    console.log(`  Middle name populated: ${withMiddle.toLocaleString("en-CA")}`);
    console.log(`  List ID populated:     ${withExternal.toLocaleString("en-CA")}`);

    console.log("  sample rows:");
    for (const v of voters.slice(0, 10)) {
      console.log(
        `    first="${v.firstName}" middle="${v.middleName}" last="${v.lastName}"`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
