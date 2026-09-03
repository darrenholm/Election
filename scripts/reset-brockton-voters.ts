/**
 * Clear a municipality's voters so the clerk's list can be re-imported whole.
 *
 * Why this exists: the CSV import mapped "Middle Name" to List ID, which is
 * unique per municipality and treated as "already on file", so Brockton's
 * 8,194 electors collapsed to 2,554 rows — one survivor per distinct middle
 * name, plus the 983 with no middle name at all. The survivors cannot be
 * repaired into the missing rows; the list has to come in again.
 *
 * The clerk's file carries no elector-number column, so re-importing on top of
 * the existing rows would duplicate every one of them. Hence: delete, then
 * import.
 *
 * Reports and changes nothing until you add --apply:
 *
 *   npx tsx scripts/reset-brockton-voters.ts --municipality Brockton
 *   npx tsx scripts/reset-brockton-voters.ts --municipality Brockton --apply
 *
 * Deleting a Voter cascades to VoterCampaignState and ContactAttempt, and nulls
 * the voter link on CanvassPhoto, Volunteer, SignRequest and TextMessage. The
 * report counts all six first — if any are non-zero, stop and think, because
 * re-importing restores the voters but not their connections to those rows.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const wanted: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--municipality" && argv[i + 1]) wanted.push(argv[++i]);
}

async function main() {
  if (wanted.length === 0) {
    console.log("Name a municipality: --municipality Brockton");
    return;
  }

  const municipalities = await db.municipality.findMany();
  const targets = municipalities.filter((m) =>
    wanted.some((w) => w === m.id || w.toLowerCase() === m.name.toLowerCase()),
  );

  if (targets.length === 0) {
    console.log("No municipality matched. On file:");
    for (const m of municipalities) console.log(`  ${m.name}  (${m.id})`);
    return;
  }

  console.log(apply ? "APPLYING CHANGES\n" : "DRY RUN — nothing will be written\n");

  for (const m of targets) {
    const voterIds = (
      await db.voter.findMany({ where: { municipalityId: m.id }, select: { id: true } })
    ).map((v) => v.id);
    const inVoters = { voterId: { in: voterIds } };

    const [states, attempts, photos, volunteers, signs, texts] = await Promise.all([
      db.voterCampaignState.count({ where: inVoters }),
      db.contactAttempt.count({ where: inVoters }),
      db.canvassPhoto.count({ where: inVoters }),
      db.volunteer.count({ where: inVoters }),
      db.signRequest.count({ where: inVoters }),
      db.textMessage.count({ where: inVoters }),
    ]);

    console.log(`${m.name} — ${voterIds.length.toLocaleString("en-CA")} voters`);
    console.log(`  campaign state rows (deleted with the voter):  ${states}`);
    console.log(`  contact attempts    (deleted with the voter):  ${attempts}`);
    console.log(`  canvass photos      (voter link cleared):      ${photos}`);
    console.log(`  volunteers          (voter link cleared):      ${volunteers}`);
    console.log(`  sign requests       (voter link cleared):      ${signs}`);
    console.log(`  text messages       (voter link cleared):      ${texts}`);

    const attached = states + attempts + photos + volunteers + signs + texts;
    if (attached > 0) {
      console.log(
        `\n  ${attached} rows reference these voters. Deleting loses those links.`,
      );
      if (!apply) console.log("  Re-run with --apply only if that is acceptable.\n");
      else {
        console.log("  Refusing to delete. Clear or re-point these rows first.\n");
        continue;
      }
    }

    if (!apply) {
      console.log("");
      continue;
    }

    const deleted = await db.voter.deleteMany({ where: { municipalityId: m.id } });
    console.log(`\n  deleted ${deleted.count.toLocaleString("en-CA")} voters`);
    console.log("  now re-import the clerk's CSV at /voters/import\n");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
