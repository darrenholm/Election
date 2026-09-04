/**
 * Give West Grey's numberless properties a street to belong to.
 *
 * 241 households carry a legal land description instead of an address —
 * "CON 11 PT LOT 23 RP 16R5297 PART 2", "PLAN 10 LOT 16 JAMES ST N/S" — so
 * each is its own one-door "street" in a list meant for planning a canvass.
 *
 * Two rules, decided by the candidate rather than by this script:
 *
 *   Concessions group by concession. You drive Concession 11 and knock every
 *   farm on it; which part-lot a farm sits on is not how the day is planned.
 *
 *   Everything else is checked against the streets the town actually has,
 *   because the village descriptions carry a real street name inside them. A
 *   registered plan with no street name falls back to the plan.
 *
 * Nothing is discarded: the original description is kept in the household's
 * notes, so the lot and reference plan are still there when somebody needs to
 * find the property on a map.
 *
 * Reports and changes nothing until you add --apply:
 *
 *   npx tsx scripts/group-rural-addresses.ts --municipality <id>
 *   npx tsx scripts/group-rural-addresses.ts --municipality <id> --apply
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

/** Obvious damage in the clerk's text, fixed before anything is read from it. */
function tidy(value: string): string {
  return value
    .toUpperCase()
    .replace(/\*/g, " ")
    // Glenelg, transposed. It would never group with the correct spelling.
    .replace(/\bGLENLEG\b/g, "GLENELG")
    // "CONCESSION 12 CON 12 PT LOT 6" — the prefix written twice.
    .replace(/\bCONCESSION (\d+) CON \1\b/g, "CON $1")
    .replace(/\bCONCESSION\b/g, "CON")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The concession number, from any of the shapes these take: "CON 11 …",
 * "BENTINCK CON 3 …", "BASELINE CON 12 …". The township prefix appears on only
 * a minority of rows, so the number is the part that can be relied on.
 */
function concessionOf(value: string): string | null {
  const m = /(?:^|\s)CON (\d+)\b/.exec(value);
  return m ? `CON ${m[1]}` : null;
}

/** "PLAN 813 LOT 9" -> "PLAN 813"; "RCP 816 PT LOT 1" -> "RCP 816". */
function planOf(value: string): string | null {
  const m = /^(RCP|CP|PLAN) (\d+)\b/.exec(value);
  return m ? `${m[1]} ${m[2]}` : null;
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
      select: { id: true, streetNumber: true, streetName: true, streetKey: true, notes: true },
    });

    // The streets the town actually has, taken from the properly addressed
    // households. Inventing a street out of a description would be worse than
    // leaving the description alone.
    const known = new Map<string, string>();
    for (const h of households) {
      if (h.streetNumber.trim() === "" || h.streetKey === "") continue;
      if (!known.has(h.streetKey)) known.set(h.streetKey, h.streetName);
    }
    // Longest first, so "DURHAM RD E" is preferred over "DURHAM RD".
    const vocabulary = [...known.entries()]
      .map(([key, name]) => ({ key, name, words: name.split(" ").filter(Boolean) }))
      .filter((s) => s.words.length >= 2)
      .sort((a, b) => b.words.length - a.words.length);

    const streetsBefore = new Set(households.map((h) => h.streetKey)).size;
    const numberless = households.filter((h) => h.streetNumber.trim() === "");

    type Change = { id: string; before: string; name: string; key: string; why: string };
    const changes: Change[] = [];
    const leftAlone: string[] = [];

    for (const h of numberless) {
      const clean = tidy(h.streetName);
      const words = clean.split(" ");

      // A concession is a concession, whatever else the description says.
      const concession = concessionOf(clean);
      if (concession) {
        changes.push({
          id: h.id,
          before: h.streetName,
          name: concession,
          key: canonicalStreet(concession),
          why: "concession",
        });
        continue;
      }

      // Otherwise look for a street the town already has, matched as a run of
      // whole words. Two equally long matches means the description names two
      // streets — "MILL ST S JAMES ST N" — and choosing one would be a guess.
      const found = vocabulary.filter((s) => {
        for (let i = 0; i + s.words.length <= words.length; i++) {
          if (s.words.every((w, j) => words[i + j] === w)) return true;
        }
        return false;
      });
      const longest = found.filter((s) => s.words.length === found[0]?.words.length);

      if (longest.length === 1) {
        changes.push({
          id: h.id,
          before: h.streetName,
          name: longest[0].name,
          key: longest[0].key,
          why: "street named in the description",
        });
        continue;
      }

      const plan = planOf(clean);
      if (plan) {
        changes.push({
          id: h.id,
          before: h.streetName,
          name: plan,
          key: canonicalStreet(plan),
          why: longest.length > 1 ? "registered plan (names two streets)" : "registered plan",
        });
        continue;
      }

      leftAlone.push(h.streetName);
    }

    const keysAfter = new Set(
      households.map((h) => changes.find((c) => c.id === h.id)?.key ?? h.streetKey),
    );

    const byReason = new Map<string, number>();
    for (const c of changes) byReason.set(c.why, (byReason.get(c.why) ?? 0) + 1);

    console.log(`${m.name} — ${numberless.length.toLocaleString("en-CA")} numberless households`);
    for (const [why, n] of byReason) console.log(`  ${why}: ${n}`);
    console.log(`  left alone: ${leftAlone.length}`);
    console.log(
      `  distinct streets: ${streetsBefore.toLocaleString("en-CA")} -> ${keysAfter.size.toLocaleString("en-CA")}`,
    );

    const named = changes.filter((c) => c.why.startsWith("street"));
    if (named.length > 0) {
      console.log("\n  matched to a real street:");
      for (const c of named) console.log(`    "${c.before}"\n      -> ${c.name}`);
    }

    const plans = changes.filter((c) => c.why.startsWith("registered"));
    if (plans.length > 0) {
      console.log("\n  grouped by registered plan:");
      for (const c of plans.slice(0, 12)) console.log(`    "${c.before}"  ->  ${c.name}`);
      if (plans.length > 12) console.log(`    …and ${plans.length - 12} more`);
    }

    const cons = changes.filter((c) => c.why === "concession");
    if (cons.length > 0) {
      const spread = new Map<string, number>();
      for (const c of cons) spread.set(c.name, (spread.get(c.name) ?? 0) + 1);
      console.log("\n  grouped by concession:");
      for (const [name, n] of [...spread.entries()].sort(
        (a, b) => Number(a[0].split(" ")[1]) - Number(b[0].split(" ")[1]),
      )) {
        console.log(`    ${name.padEnd(8)} ${n} household(s)`);
      }
    }

    if (leftAlone.length > 0) {
      console.log("\n  left alone:");
      for (const value of leftAlone) console.log(`    "${value}"`);
    }

    if (!apply) {
      console.log("");
      continue;
    }

    let done = 0;
    for (const c of changes) {
      const household = households.find((h) => h.id === c.id)!;
      await db.household.update({
        where: { id: c.id },
        data: {
          streetName: normaliseStreet(c.name),
          streetKey: c.key,
          // The description is the only record of which lot this is. Keep it.
          notes: household.notes.trim() === "" ? c.before : household.notes,
        },
      });
      done++;
    }
    console.log(`\n  regrouped ${done.toLocaleString("en-CA")} households\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
