import { cookies } from "next/headers";
import { db } from "./db";
import { computeLimits, type LimitSet } from "./ontario";
import { getAccessibleCampaigns, getCurrentUser } from "./auth";

/**
 * Which campaign the user is currently working on.
 *
 * A consultant may be running six candidates across two municipalities, so
 * almost every query in the app has to be scoped. The active campaign is held
 * in a cookie rather than in the URL: it keeps every route path unchanged, and
 * because a cookie is per-browser two people can work on different campaigns at
 * the same time without treading on each other.
 */

export const ACTIVE_CAMPAIGN_COOKIE = "active_campaign";

export type ActiveCampaign = NonNullable<Awaited<ReturnType<typeof findActiveCampaign>>>;

async function findActiveCampaign() {
  const user = await getCurrentUser();
  if (!user) return null;

  // The cookie is a preference, not a permission. Whatever it names, the
  // campaign is only returned if this user actually has access to it —
  // otherwise anyone could switch to a rival's campaign by editing a cookie.
  const allowed = await getAccessibleCampaigns();
  if (allowed.length === 0) return null;

  const jar = await cookies();
  const requested = jar.get(ACTIVE_CAMPAIGN_COOKIE)?.value;
  const chosenId = allowed.some((c) => c.id === requested) ? requested : allowed[0].id;

  return db.campaign.findUnique({
    where: { id: chosenId },
    include: { municipality: true },
  });
}

/**
 * The active campaign, or null when the user has none. Pages that cannot do
 * anything useful without one should redirect to /campaigns.
 */
export async function getActiveCampaign() {
  return findActiveCampaign();
}

/**
 * The active campaign's id, for scoping a query. Throws when there is none —
 * which is the safe failure: a query that cannot be scoped must not run.
 */
export async function requireCampaignId(): Promise<string> {
  const campaign = await findActiveCampaign();
  if (!campaign) throw new Error("No campaign available to this account");
  return campaign.id;
}

/** Campaigns this user may see, for the management page. */
export async function listCampaigns() {
  const user = await getCurrentUser();
  if (!user) return [];

  return db.campaign.findMany({
    where: user.isAdmin ? undefined : { access: { some: { userId: user.id } } },
    include: {
      municipality: true,
      _count: { select: { contacts: true, volunteers: true, signRequests: true } },
    },
    orderBy: [{ isActive: "desc" }, { municipality: { name: "asc" } }, { candidateName: "asc" }],
  });
}

export async function getLimits(): Promise<(LimitSet & { campaign: ActiveCampaign }) | null> {
  const campaign = await findActiveCampaign();
  if (!campaign) return null;
  return { ...computeLimits(campaign), campaign };
}

/** Fourth Monday of October in the next Ontario municipal election year. */
export function nextOntarioVotingDay(from: Date = new Date()): Date {
  // Elections run every four years; 2022 and 2026 are election years.
  let year = from.getFullYear();
  year = year + ((((2026 - year) % 4) + 4) % 4);
  let day = fourthMondayOfOctober(year);
  if (day < from) day = fourthMondayOfOctober(year + 4);
  return day;
}

function fourthMondayOfOctober(year: number): Date {
  const first = new Date(year, 9, 1);
  const offsetToMonday = (8 - first.getDay()) % 7; // 0 = Sunday
  return new Date(year, 9, 1 + offsetToMonday + 21);
}

/** True when the campaign has enough detail for the compliance figures to mean anything. */
export function isCampaignConfigured(campaign: {
  candidateName: string;
  electorCount: number;
}): boolean {
  return campaign.candidateName.trim() !== "" && campaign.electorCount > 0;
}

/** URL-safe handle derived from a candidate's name and office. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
