/**
 * Create a candidate's account, and the campaign it reaches, in one go.
 *
 * The app has no email sending, so onboarding a candidate is three separate
 * screens: make the campaign, make the account, grant it access. Doing that by
 * hand is fine once and error-prone by the fifth candidate — and the expensive
 * mistake is typing a municipality name that already exists in a slightly
 * different form, which silently creates a second municipality sharing none of
 * the loaded doors or electors. This matches municipality names
 * case-insensitively and refuses to invent one unless told to.
 *
 * Dry run by default; nothing is written without --apply.
 *
 *   npx tsx scripts/create-account.ts \
 *     --email evan@rollingacresgrain.com \
 *     --name "Evan Renwick" \
 *     --municipality Howick \
 *     --office COUNCILLOR \
 *     --apply
 *
 * The temporary password is printed once, on success. It is not recoverable
 * afterwards — passwords are hashed — so if it is lost, issue a new one from
 * the Team page rather than running this again.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, temporaryPassword } from "../src/lib/password";

const db = new PrismaClient();

const OFFICES = [
  "HEAD_OF_COUNCIL",
  "DEPUTY_HEAD_OF_COUNCIL",
  "COUNCILLOR",
  "SCHOOL_TRUSTEE",
  "OTHER",
] as const;
const ROLES = ["OWNER", "MANAGER", "CANVASSER", "VIEWER"] as const;

const argv = process.argv.slice(2);
function opt(flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}
const flag = (name: string) => argv.includes(name);

const email = (opt("--email") ?? "").trim().toLowerCase();
const name = (opt("--name") ?? "").trim();
const municipalityName = (opt("--municipality") ?? "").trim();
const candidateName = (opt("--candidate") ?? name).trim();
const office = (opt("--office") ?? "COUNCILLOR").toUpperCase();
const role = (opt("--role") ?? "OWNER").toUpperCase();
const ward = (opt("--ward") ?? "").trim();
const electorCount = Number(opt("--electors") ?? 0);
const apply = flag("--apply");
// Creating a municipality is the one step that cannot be undone from the UI,
// so it is opt-in rather than a side effect of a typo.
const createMunicipality = flag("--create-municipality");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!email.includes("@")) fail("--email is required and must be an email address.");
if (name === "") fail("--name is required.");
if (municipalityName === "") fail("--municipality is required.");
if (!OFFICES.includes(office as (typeof OFFICES)[number]))
  fail(`--office must be one of: ${OFFICES.join(", ")}`);
if (!ROLES.includes(role as (typeof ROLES)[number]))
  fail(`--role must be one of: ${ROLES.join(", ")}`);
if (!Number.isInteger(electorCount) || electorCount < 0)
  fail("--electors must be a whole number.");

/** Fourth Monday of October in the next Ontario municipal election year. */
function nextOntarioVotingDay(from: Date = new Date()): Date {
  let year = from.getFullYear();
  year = year + ((((2026 - year) % 4) + 4) % 4);
  const fourthMonday = (y: number) => {
    const first = new Date(y, 9, 1);
    return new Date(y, 9, 1 + ((8 - first.getDay()) % 7) + 21);
  };
  const day = fourthMonday(year);
  return day < from ? fourthMonday(year + 4) : day;
}

/**
 * Both copied from src/lib/campaign.ts rather than imported: that module pulls
 * in next/headers for the active-campaign cookie, which does not load outside a
 * request. Keep them in step if the originals change.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  console.log(apply ? "APPLYING\n" : "DRY RUN — nothing will be written. Add --apply.\n");

  if (await db.user.findUnique({ where: { email } }))
    fail(
      `An account already exists for ${email}. Issue a fresh temporary password from the Team page instead.`,
    );

  // Prisma has no case-insensitive unique lookup, so compare in memory. The
  // table holds one row per municipality in the operation — a handful.
  const all = await db.municipality.findMany({ select: { id: true, name: true } });
  const match = all.find((m) => m.name.toLowerCase() === municipalityName.toLowerCase());

  if (!match && !createMunicipality)
    fail(
      `No municipality named "${municipalityName}". On file: ${all.map((m) => m.name).join(", ") || "none"}.\n` +
        "Pass --create-municipality if it really is new. Creating one it should have shared means it shares no doors or electors.",
    );

  console.log(
    match
      ? `Municipality: ${match.name} — existing, doors and electors shared.`
      : `Municipality: ${municipalityName} — NEW, starts with no doors and no voters.`,
  );

  const votingDay = nextOntarioVotingDay();
  const base = slugify(`${candidateName}-${office}`) || "campaign";
  let slug = base;
  for (let n = 2; await db.campaign.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;

  const password = temporaryPassword();

  console.log(`Campaign:     ${candidateName} — ${office}${ward ? ` (ward ${ward})` : ""} [${slug}]`);
  console.log(`Voting day:   ${votingDay.toDateString()}`);
  console.log(`Account:      ${name} <${email}>, role ${role}, must change password at first sign-in`);

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply.");
    return;
  }

  const municipalityId =
    match?.id ??
    (await db.municipality.create({ data: { name: municipalityName, usesWards: ward !== "" } })).id;

  const campaign = await db.campaign.create({
    data: {
      slug,
      candidateName,
      office,
      municipalityId,
      ward,
      votingDay,
      campaignPeriodStart: new Date(votingDay.getFullYear(), 0, 2),
      electorCount,
      contactEmail: email,
    },
  });

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });

  await db.campaignAccess.create({ data: { userId: user.id, campaignId: campaign.id, role } });

  console.log("\nDone. Send these, then destroy your copy:");
  console.log(`  Sign in:            ${process.env.APP_URL ?? "https://electionmgr.ca"}`);
  console.log(`  Email:              ${email}`);
  console.log(`  Temporary password: ${password}`);
  console.log("\nShown once. It cannot be read back — reset it from the Team page if it is lost.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
