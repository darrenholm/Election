/**
 * Clear out test data before handing the app to real candidates.
 *
 * There is no delete button for a campaign in the app — /campaigns can only
 * archive, which hides a campaign without removing anything — so this is the
 * way to get rid of one for good. Run it against the deployment's database:
 *
 *   DATABASE_URL="postgresql://..." npx tsx scripts/scrub-test-data.ts
 *
 * With no arguments it only lists what is on file. Nothing is deleted until
 * you name something and add --yes.
 *
 *   # what is in there
 *   npx tsx scripts/scrub-test-data.ts
 *
 *   # a dry run, then the real thing
 *   npx tsx scripts/scrub-test-data.ts --campaign "Test Candidate"
 *   npx tsx scripts/scrub-test-data.ts --campaign "Test Candidate" --yes
 *
 *   # a whole practice town, electors and doors included
 *   npx tsx scripts/scrub-test-data.ts --municipality "Testville" --yes
 *
 * Campaigns and municipalities can be named or given by id, and the flags can
 * be repeated. Deleting a campaign takes its canvassing record, volunteers,
 * shifts, donors, contributions, expenses, signs, events and text campaigns
 * with it — the database enforces that, so nothing is left orphaned.
 *
 * What deleting a campaign does NOT take is the electors and the doors: those
 * belong to the municipality and are shared by every candidate running there,
 * which is the point of them. If a test import put fake electors on a real
 * town, no amount of campaign deleting will clear them; --municipality does,
 * but it removes the town and everything standing on it.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function flagValues(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  argv.forEach((arg, i) => {
    if (arg === `--${name}`) {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) out.push(value);
    } else if (arg.startsWith(`--${name}=`)) {
      out.push(arg.slice(name.length + 3));
    }
  });
  return out;
}

const wantedCampaigns = flagValues("campaign");
const wantedMunicipalities = flagValues("municipality");
const confirmed = process.argv.includes("--yes");

async function list() {
  const municipalities = await db.municipality.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { voters: true, households: true } },
      campaigns: {
        orderBy: { candidateName: "asc" },
        include: {
          _count: {
            select: {
              contacts: true,
              turfs: true,
              volunteers: true,
              contributors: true,
              contributions: true,
              expenses: true,
              signRequests: true,
              events: true,
              textCampaigns: true,
              access: true,
            },
          },
        },
      },
    },
  });

  console.log("\nOn file\n═══════");
  for (const m of municipalities) {
    console.log(
      `\n${m.name}  —  ${m._count.voters} electors, ${m._count.households} doors`,
    );
    if (m.campaigns.length === 0) {
      console.log("    (no campaigns)");
      continue;
    }
    for (const c of m.campaigns) {
      const n = c._count;
      const bits = [
        `${n.contacts} contacts`,
        `${n.turfs} turfs`,
        `${n.volunteers} volunteers`,
        `${n.contributors} donors`,
        `${n.contributions} contributions`,
        `${n.expenses} expenses`,
        `${n.signRequests} signs`,
        `${n.events} events`,
        `${n.textCampaigns} text campaigns`,
        `${n.access} people with access`,
      ];
      console.log(`    ${c.candidateName} (${c.office}${c.ward ? `, ${c.ward}` : ""})`);
      console.log(`        ${c.isActive ? "active" : "archived"} · id ${c.id}`);
      console.log(`        ${bits.join(", ")}`);
    }
  }

  const users = await db.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, name: true, isAdmin: true, isActive: true },
  });
  console.log("\nAccounts\n════════");
  for (const u of users) {
    const tags = [u.isAdmin ? "admin" : null, u.isActive ? null : "deactivated"]
      .filter(Boolean)
      .join(", ");
    console.log(`    ${u.email}  ${u.name}${tags ? `  [${tags}]` : ""}`);
  }
  console.log(
    "\nTest accounts are not touched by this script — deactivate or repoint them under Team.\n",
  );
}

async function main() {
  if (wantedCampaigns.length === 0 && wantedMunicipalities.length === 0) {
    await list();
    console.log(
      "Nothing named, so nothing deleted. Pass --campaign <name|id> or " +
        "--municipality <name|id> to see what would go.\n",
    );
    return;
  }

  const campaigns = await db.campaign.findMany({
    where: { OR: [{ id: { in: wantedCampaigns } }, { candidateName: { in: wantedCampaigns } }] },
    include: { municipality: { select: { name: true } } },
  });
  const municipalities = await db.municipality.findMany({
    where: { OR: [{ id: { in: wantedMunicipalities } }, { name: { in: wantedMunicipalities } }] },
    include: { _count: { select: { campaigns: true, voters: true, households: true } } },
  });

  const missing = [
    ...wantedCampaigns.filter(
      (w) => !campaigns.some((c) => c.id === w || c.candidateName === w),
    ),
    ...wantedMunicipalities.filter(
      (w) => !municipalities.some((m) => m.id === w || m.name === w),
    ),
  ];
  if (missing.length > 0) {
    console.error(`\nNot found, so refusing to guess: ${missing.join(", ")}`);
    console.error("Run with no arguments to see the exact names.\n");
    process.exitCode = 1;
    return;
  }

  console.log(confirmed ? "\nDeleting\n════════" : "\nWould delete (dry run)\n══════════════════════");
  for (const c of campaigns) {
    console.log(`    campaign  ${c.candidateName} — ${c.municipality.name}`);
    console.log("              and its canvassing, volunteers, money, signs, events and texting");
  }
  for (const m of municipalities) {
    console.log(`    town      ${m.name}`);
    console.log(
      `              and its ${m._count.campaigns} campaigns, ` +
        `${m._count.voters} electors and ${m._count.households} doors`,
    );
  }

  if (!confirmed) {
    console.log("\nAdd --yes to go ahead. There is no undo.\n");
    return;
  }

  // One transaction: a half-finished scrub is worse than either end of it.
  await db.$transaction([
    ...campaigns.map((c) => db.campaign.delete({ where: { id: c.id } })),
    ...municipalities.map((m) => db.municipality.delete({ where: { id: m.id } })),
  ]);

  console.log("\nDone.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
