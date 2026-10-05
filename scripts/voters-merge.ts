/**
 * Merge voters who are the same person entered twice.
 *
 * The companion to scripts/voters-duplicates.ts: that one finds the repeats a
 * re-imported voters' list left behind, this one folds them back together.
 * Everything the campaign has done against the duplicate — canvassing, support
 * levels, sign requests, texts, photos, volunteer records — is moved onto the
 * record being kept, and only then is the duplicate removed.
 *
 * It is a DRY RUN unless you pass --apply. Nothing is written without it.
 *
 *   npx tsx scripts/voters-merge.ts --csv dupes.csv
 *   npx tsx scripts/voters-merge.ts --csv dupes.csv --confidence CERTAIN --apply
 *   npx tsx scripts/voters-merge.ts --keep <id> --merge <id>,<id> --apply
 *
 *   --csv <path>            the file scripts/voters-duplicates.ts --csv wrote.
 *                           Rows are read in order: a "keep" row opens a group
 *                           and the "merge" rows under it belong to it, so the
 *                           file can be edited in a spreadsheet first to change
 *                           which record survives.
 *   --confidence CERTAIN    only the groups marked that way, which is the way
 *                           to clear the safe ones and leave LIKELY to a person
 *   --keep / --merge        one group named on the command line instead
 *   --apply                 actually do it
 *
 * Each group is one transaction: either the whole merge lands or none of it
 * does, so a failure halfway cannot leave a voter with their canvassing moved
 * and their record still sitting there.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { joinList, splitList } from "../src/lib/enums";

const db = new PrismaClient();

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}
const apply = process.argv.includes("--apply");
const csvPath = flag("--csv");
const keepArg = flag("--keep");
const mergeArg = flag("--merge");
const confidence = flag("--confidence")?.toUpperCase();

type Group = { keep: string; merge: string[]; confidence: string; label: string };

function groupsFromCsv(path: string): Group[] {
  // The finder writes a byte-order mark for Excel's sake; Papa would otherwise
  // hand back a first column called "﻿municipality".
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const groups: Group[] = [];
  for (const row of parsed.data) {
    const role = (row.keep_or_merge ?? "").trim().toLowerCase();
    const id = (row.voter_id ?? "").trim();
    if (id === "") continue;

    if (role === "keep") {
      groups.push({
        keep: id,
        merge: [],
        confidence: (row.confidence ?? "").trim().toUpperCase(),
        label: (row.group ?? "").trim(),
      });
    } else if (role === "merge") {
      const current = groups[groups.length - 1];
      if (!current) {
        throw new Error(`a "merge" row (${id}) appears before any "keep" row`);
      }
      current.merge.push(id);
    }
  }
  return groups.filter((g) => g.merge.length > 0);
}

/* ------------------------------------------------------------ field merges */

/** The kept value wins; the duplicate only fills a gap. */
function fill(keep: string, dup: string): string {
  return keep.trim() !== "" ? keep : dup;
}

/**
 * Texting consent, merged the only way it safely can be.
 *
 * A refusal outranks a grant, whichever record it sits on. Someone who told
 * one canvasser to stop and another they were happy to hear from must come out
 * of this stopped — a merge that quietly re-grants consent is how a campaign
 * ends up texting a person who revoked it, which is both a CASL problem and a
 * good way to lose a voter.
 */
const CONSENT_RANK: Record<string, number> = {
  REVOKED: 4,
  DECLINED: 3,
  GRANTED: 2,
  UNKNOWN: 1,
};

function strongerConsent(a: string, b: string): string {
  return (CONSENT_RANK[a] ?? 0) >= (CONSENT_RANK[b] ?? 0) ? a : b;
}

type State = Prisma.VoterCampaignStateGetPayload<Record<string, never>>;

/** Fold a duplicate's campaign state into the kept one. */
function mergeState(keep: State, dup: State): Prisma.VoterCampaignStateUpdateInput {
  const consent = strongerConsent(keep.smsConsent, dup.smsConsent);
  // The wording and the date have to travel with the answer they belong to, or
  // the record says someone consented on a day nobody asked them anything.
  const consentFrom = consent === keep.smsConsent ? keep : dup;

  const endorses = keep.willEndorsePublicly || dup.willEndorsePublicly;
  const endorsementFrom = keep.willEndorsePublicly ? keep : dup;

  return {
    supportLevel: keep.supportLevel ?? dup.supportLevel,
    // A yes anywhere is a yes, and a do-not-contact anywhere is binding.
    wantsSign: keep.wantsSign || dup.wantsSign,
    wantsToVolunteer: keep.wantsToVolunteer || dup.wantsToVolunteer,
    isDonorProspect: keep.isDonorProspect || dup.isDonorProspect,
    doNotContact: keep.doNotContact || dup.doNotContact,
    votedAt: keep.votedAt ?? dup.votedAt,
    willEndorsePublicly: endorses,
    endorsementAt: endorses ? endorsementFrom.endorsementAt : null,
    endorsementWording: endorses ? endorsementFrom.endorsementWording : "",
    smsConsent: consent,
    smsConsentAt: consentFrom.smsConsentAt,
    smsConsentSource: consentFrom.smsConsentSource,
    smsConsentWording: consentFrom.smsConsentWording,
    tags: joinList([...splitList(keep.tags), ...splitList(dup.tags)]),
    // Notes are somebody's handwriting about a person. Never drop one.
    notes: [keep.notes.trim(), dup.notes.trim()].filter(Boolean).join("\n---\n"),
  };
}

/* -------------------------------------------------------------- the merge */

type Moved = Record<string, number>;

async function mergeGroup(group: Group): Promise<{ label: string; moved: Moved; notes: string[] }> {
  const ids = [group.keep, ...group.merge];
  const voters = await db.voter.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, municipalityId: true, externalId: true, firstName: true, middleName: true,
      lastName: true, email: true, phone: true, language: true, birthYear: true,
      householdId: true, movedAway: true, deceased: true,
    },
  });

  const keep = voters.find((v) => v.id === group.keep);
  if (!keep) throw new Error(`the record to keep (${group.keep}) is not on file`);
  const dups = group.merge.map((id) => {
    const found = voters.find((v) => v.id === id);
    if (!found) throw new Error(`the record to merge (${id}) is not on file`);
    if (found.municipalityId !== keep.municipalityId) {
      throw new Error(`${id} is in a different municipality from ${keep.id} — not merging those`);
    }
    if (found.id === keep.id) throw new Error(`${id} is listed as both keep and merge`);
    return found;
  });

  const moved: Moved = {};
  const notes: string[] = [];
  const bump = (what: string, n: number) => {
    if (n > 0) moved[what] = (moved[what] ?? 0) + n;
  };

  await db.$transaction(async (tx) => {
    for (const dup of dups) {
      // Campaign state is the one thing that cannot simply be pointed at the
      // kept record: there is a unique on (campaign, voter), so where both
      // records have a state for the same campaign the two are folded together
      // and the duplicate's row dropped.
      const dupStates = await tx.voterCampaignState.findMany({ where: { voterId: dup.id } });
      for (const dupState of dupStates) {
        const keepState = await tx.voterCampaignState.findUnique({
          where: { campaignId_voterId: { campaignId: dupState.campaignId, voterId: keep.id } },
        });
        if (keepState) {
          await tx.voterCampaignState.update({
            where: { id: keepState.id },
            data: mergeState(keepState, dupState),
          });
          await tx.voterCampaignState.delete({ where: { id: dupState.id } });
          bump("campaign records folded together", 1);
        } else {
          await tx.voterCampaignState.update({
            where: { id: dupState.id },
            data: { voterId: keep.id },
          });
          bump("campaign records moved", 1);
        }
      }

      // Everything else carries no unique on the voter, so it just moves.
      bump("contacts", (await tx.contactAttempt.updateMany({ where: { voterId: dup.id }, data: { voterId: keep.id } })).count);
      bump("sign requests", (await tx.signRequest.updateMany({ where: { voterId: dup.id }, data: { voterId: keep.id } })).count);
      bump("volunteer records", (await tx.volunteer.updateMany({ where: { voterId: dup.id }, data: { voterId: keep.id } })).count);
      bump("text messages", (await tx.textMessage.updateMany({ where: { voterId: dup.id }, data: { voterId: keep.id } })).count);
      bump("canvass photos", (await tx.canvassPhoto.updateMany({ where: { voterId: dup.id }, data: { voterId: keep.id } })).count);

      // The duplicate goes before the kept record can take its list ID, which
      // is unique per municipality.
      await tx.voter.delete({ where: { id: dup.id } });

      const data: Prisma.VoterUpdateInput = {
        middleName: fill(keep.middleName, dup.middleName),
        email: fill(keep.email, dup.email),
        phone: fill(keep.phone, dup.phone),
        language: fill(keep.language, dup.language),
        birthYear: keep.birthYear ?? dup.birthYear,
        // Objective facts about the person: true on either record is true.
        movedAway: keep.movedAway || dup.movedAway,
        deceased: keep.deceased || dup.deceased,
      };
      if (!keep.externalId && dup.externalId) {
        data.externalId = dup.externalId;
        notes.push(`took list ID ${dup.externalId} from the duplicate`);
      }
      if (!keep.householdId && dup.householdId) {
        data.household = { connect: { id: dup.householdId } };
        notes.push("took the address from the duplicate");
      }
      await tx.voter.update({ where: { id: keep.id }, data });
      bump("records removed", 1);
    }
  });

  return { label: group.label || keep.id, moved, notes };
}

/** What a merge would move, without moving any of it. */
async function previewGroup(group: Group): Promise<{ label: string; moved: Moved; notes: string[] }> {
  const keep = await db.voter.findUnique({
    where: { id: group.keep },
    select: { id: true, firstName: true, lastName: true, externalId: true, householdId: true },
  });
  if (!keep) throw new Error(`the record to keep (${group.keep}) is not on file`);

  const moved: Moved = {};
  const notes: string[] = [];
  for (const id of group.merge) {
    const dup = await db.voter.findUnique({
      where: { id },
      select: {
        externalId: true, householdId: true,
        _count: {
          select: {
            campaignStates: true, contacts: true, signRequests: true,
            volunteers: true, textMessages: true, canvassPhotos: true,
          },
        },
      },
    });
    if (!dup) throw new Error(`the record to merge (${id}) is not on file`);
    const c = dup._count;
    if (c.campaignStates) moved["campaign records"] = (moved["campaign records"] ?? 0) + c.campaignStates;
    if (c.contacts) moved["contacts"] = (moved["contacts"] ?? 0) + c.contacts;
    if (c.signRequests) moved["sign requests"] = (moved["sign requests"] ?? 0) + c.signRequests;
    if (c.volunteers) moved["volunteer records"] = (moved["volunteer records"] ?? 0) + c.volunteers;
    if (c.textMessages) moved["text messages"] = (moved["text messages"] ?? 0) + c.textMessages;
    if (c.canvassPhotos) moved["canvass photos"] = (moved["canvass photos"] ?? 0) + c.canvassPhotos;
    moved["records removed"] = (moved["records removed"] ?? 0) + 1;
    if (!keep.externalId && dup.externalId) notes.push(`would take list ID ${dup.externalId}`);
    if (!keep.householdId && dup.householdId) notes.push("would take the address from the duplicate");
  }
  return { label: group.label || `${keep.firstName} ${keep.lastName}`.trim() || keep.id, moved, notes };
}

async function main() {
  let groups: Group[];
  if (csvPath) {
    groups = groupsFromCsv(csvPath);
  } else if (keepArg && mergeArg) {
    groups = [{
      keep: keepArg.trim(),
      merge: mergeArg.split(",").map((s) => s.trim()).filter(Boolean),
      confidence: "",
      label: "",
    }];
  } else {
    console.error("Give it either --csv <path>, or --keep <id> --merge <id>,<id>.");
    process.exit(1);
  }

  if (confidence) groups = groups.filter((g) => g.confidence === confidence);

  if (groups.length === 0) {
    console.log(confidence ? `No groups marked ${confidence}.` : "No groups to merge.");
    return;
  }

  console.log(
    apply
      ? `Merging ${groups.length} group${groups.length === 1 ? "" : "s"}.`
      : `DRY RUN — ${groups.length} group${groups.length === 1 ? "" : "s"}. Nothing will be written. Add --apply to do it.`,
  );
  console.log("=".repeat(72));

  const failures: string[] = [];
  const totals: Moved = {};

  for (const group of groups) {
    try {
      const outcome = apply ? await mergeGroup(group) : await previewGroup(group);
      const parts = Object.entries(outcome.moved).map(([k, n]) => `${n} ${k}`);
      console.log(`\n${outcome.label}`);
      console.log(`  ${parts.length > 0 ? parts.join(", ") : "nothing attached"}`);
      for (const note of outcome.notes) console.log(`  ${note}`);
      for (const [k, n] of Object.entries(outcome.moved)) totals[k] = (totals[k] ?? 0) + n;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      failures.push(`${group.label || group.keep}: ${why}`);
      console.log(`\n${group.label || group.keep}`);
      console.log(`  SKIPPED — ${why}`);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  const summary = Object.entries(totals).map(([k, n]) => `${n} ${k}`).join(", ");
  console.log(apply ? `Done: ${summary || "nothing to move"}.` : `Would move: ${summary || "nothing"}.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} group${failures.length === 1 ? "" : "s"} skipped:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
  if (!apply) console.log("\nNothing was written. Add --apply when the above reads right.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
