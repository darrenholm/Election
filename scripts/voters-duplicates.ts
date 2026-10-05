/**
 * Find voters who are the same person entered twice.
 *
 * Written for the mess a re-imported voters' list used to make: before the
 * importer learned to match on names, every row of a re-issued list that did
 * not carry a stable List ID came in as a brand new person, so the whole file
 * doubled. This reads the voter file and reports the pairs, so they can be
 * looked at and merged by hand.
 *
 * It only ever reads. Nothing is changed, nothing is deleted.
 *
 *   npx tsx scripts/voters-duplicates.ts [options]
 *   railway run npx tsx scripts/voters-duplicates.ts        (against production)
 *
 *   --municipality <name>   only this town (substring, case-insensitive)
 *   --since <YYYY-MM-DD>    only groups where one copy arrived on or after this
 *                           date — the way to isolate a single bad import
 *   --csv <path>            also write the groups out as a spreadsheet
 *
 * Two kinds of duplicate are reported separately, because they deserve
 * different levels of trust:
 *
 *   CERTAIN  the same name, normalised. "DUBÉ, Marie" and "Dube, Marie".
 *   LIKELY   the same surname and first initial at the same door, spelled
 *            differently — "Robert" and "Rob" Schmidt at 44 Yonge St S. This
 *            is what a list that changed its name format leaves behind, and it
 *            is the one a name-only search misses.
 *
 * A LIKELY group only counts when its members arrived on different days, since
 * a duplicate is the same person coming back in a later import. That keeps a
 * parent and child who share an initial — Peter and Patricia Kelly at one door
 * — out of the report. Read the ones that remain before merging anything all
 * the same.
 */

import { PrismaClient } from "@prisma/client";
import { formatAddress, nameKey, voterInitialKey, voterNameKey } from "../src/lib/voter-match";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const municipalityFilter = flag("--municipality");
const csvPath = flag("--csv");
const sinceRaw = flag("--since");
const since = sinceRaw ? new Date(`${sinceRaw}T00:00:00Z`) : undefined;
if (sinceRaw && Number.isNaN(since!.getTime())) {
  console.error(`--since wants a date like 2026-10-05, not "${sinceRaw}"`);
  process.exit(1);
}

type Row = {
  id: string;
  externalId: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: Date;
  household: { streetNumber: string; streetName: string; unit: string; city: string } | null;
  _count: {
    campaignStates: number;
    contacts: number;
    signRequests: number;
    volunteers: number;
    textMessages: number;
    canvassPhotos: number;
  };
};

type Group = {
  confidence: "CERTAIN" | "LIKELY";
  label: string;
  members: Row[];
};

/** Canvassing, signs, texts — work that would be lost if this record went. */
function attachedWork(row: Row): number {
  const c = row._count;
  return (
    c.campaignStates + c.contacts + c.signRequests + c.volunteers + c.textMessages + c.canvassPhotos
  );
}

/**
 * Which record to keep: the one carrying the most work the campaign has done,
 * and the older one when that ties. Keeping the older record means anything
 * pointing at it from outside the voter file still points somewhere.
 */
function rank(a: Row, b: Row): number {
  const work = attachedWork(b) - attachedWork(a);
  if (work !== 0) return work;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function describe(row: Row): string {
  const bits = [
    `${formatName(row) || "(no name)"}`,
    formatAddress(row.household ?? {}) || "(no address)",
    row.externalId ? `list ID ${row.externalId}` : "no list ID",
    `added ${row.createdAt.toISOString().slice(0, 10)}`,
  ];
  const work = attachedWork(row);
  if (work > 0) bits.push(`${work} piece${work === 1 ? "" : "s"} of campaign work attached`);
  if (row.phone) bits.push(`phone ${row.phone}`);
  if (row.email) bits.push(row.email);
  return bits.join(" · ");
}

function formatName(row: { firstName: string; middleName: string; lastName: string }): string {
  return [row.firstName, row.middleName, row.lastName].map((p) => p.trim()).filter(Boolean).join(" ");
}

async function main() {
  const municipalities = await db.municipality.findMany({
    where: municipalityFilter
      ? { name: { contains: municipalityFilter, mode: "insensitive" } }
      : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (municipalities.length === 0) {
    console.log(
      municipalityFilter
        ? `No municipality matches "${municipalityFilter}".`
        : "No municipalities on file.",
    );
    return;
  }

  const csvLines: string[] = [
    "municipality,confidence,group,keep_or_merge,voter_id,name,address,list_id,added,attached_work,phone,email",
  ];
  let totalGroups = 0;
  let totalExtra = 0;

  for (const municipality of municipalities) {
    const voters: Row[] = await db.voter.findMany({
      where: { municipalityId: municipality.id },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
        household: {
          select: { streetNumber: true, streetName: true, unit: true, city: true },
        },
        _count: {
          select: {
            campaignStates: true,
            contacts: true,
            signRequests: true,
            volunteers: true,
            textMessages: true,
            canvassPhotos: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const groups: Group[] = [];
    const spoken = new Set<string>();

    // CERTAIN — the same name, however it is spelled.
    const byName = new Map<string, Row[]>();
    for (const voter of voters) {
      if (nameKey(voter.firstName) === "" && nameKey(voter.lastName) === "") continue;
      const key = voterNameKey(voter.firstName, voter.lastName);
      const bucket = byName.get(key);
      if (bucket) bucket.push(voter);
      else byName.set(key, [voter]);
    }
    for (const members of byName.values()) {
      if (members.length < 2) continue;
      for (const m of members) spoken.add(m.id);
      groups.push({ confidence: "CERTAIN", label: formatName(members[0]), members });
    }

    // LIKELY — the same surname and initial at one door, spelled differently.
    // Anyone already in a CERTAIN group is left out, so a pair is reported once.
    const byDoor = new Map<string, Row[]>();
    for (const voter of voters) {
      if (spoken.has(voter.id)) continue;
      if (!voter.household) continue;
      const key = `${voterInitialKey(voter.firstName, voter.lastName)}@${formatAddress(
        voter.household,
      ).toLowerCase()}`;
      const bucket = byDoor.get(key);
      if (bucket) bucket.push(voter);
      else byDoor.set(key, [voter]);
    }
    for (const members of byDoor.values()) {
      if (members.length < 2) continue;
      // A parent and child at one door often share a surname and an initial —
      // Peter and Patricia Kelly — and are not duplicates at all. What tells
      // them apart from a re-import is when they arrived: a duplicate is the
      // same person coming back on a later day, so a set that all landed
      // together is a household, not a repeat.
      const days = new Set(members.map((m) => m.createdAt.toISOString().slice(0, 10)));
      if (days.size < 2) continue;
      groups.push({
        confidence: "LIKELY",
        label: `${members.map((m) => m.firstName).join(" / ")} ${members[0].lastName}`,
        members,
      });
    }

    const wanted = since
      ? groups.filter((g) => g.members.some((m) => m.createdAt >= since))
      : groups;

    if (wanted.length === 0) {
      console.log(`\n${municipality.name}: no duplicates found in ${voters.length} voters.`);
      continue;
    }

    const extra = wanted.reduce((sum, g) => sum + g.members.length - 1, 0);
    totalGroups += wanted.length;
    totalExtra += extra;

    console.log(
      `\n${municipality.name} — ${wanted.length} duplicate group${
        wanted.length === 1 ? "" : "s"
      }, ${extra} extra record${extra === 1 ? "" : "s"}, out of ${voters.length} voters`,
    );
    console.log("=".repeat(72));

    for (const group of wanted.sort((a, b) => a.confidence.localeCompare(b.confidence))) {
      const ordered = [...group.members].sort(rank);
      console.log(`\n[${group.confidence}] ${group.label}`);
      ordered.forEach((row, i) => {
        console.log(`  ${i === 0 ? "KEEP " : "MERGE"}  ${describe(row)}`);
        console.log(`         ${row.id}`);
        csvLines.push(
          [
            municipality.name,
            group.confidence,
            group.label,
            i === 0 ? "keep" : "merge",
            row.id,
            formatName(row),
            formatAddress(row.household ?? {}),
            row.externalId ?? "",
            row.createdAt.toISOString().slice(0, 10),
            String(attachedWork(row)),
            row.phone,
            row.email,
          ]
            .map(csvCell)
            .join(","),
        );
      });
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  if (totalGroups === 0) {
    console.log("Nothing to merge.");
  } else {
    console.log(
      `${totalGroups} group${totalGroups === 1 ? "" : "s"} to look at, ${totalExtra} record${
        totalExtra === 1 ? "" : "s"
      } that look like repeats.`,
    );
    console.log("Nothing has been changed. Merging is still a decision for a person.");
  }

  if (csvPath) {
    // A byte-order mark and CRLF, so Excel opens it with the accents intact
    // rather than as mojibake.
    writeFileSync(csvPath, `\ufeff${csvLines.join("\r\n")}\r\n`);
    console.log(`\nWritten to ${csvPath}`);
  }
}

/** Excel opens a CSV, so anything with a comma or a quote has to be quoted. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
