import { cookies } from "next/headers";
import { db } from "./db";
import { computeLimits, type LimitSet } from "./ontario";

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
  const jar = await cookies();
  const requested = jar.get(ACTIVE_CAMPAIGN_COOKIE)?.value;

  if (requested) {
    const chosen = await db.campaign.findUnique({
      where: { id: requested },
      include: { municipality: true },
    });
    if (chosen) return chosen;
    // The cookie points at a campaign that has since been deleted; fall through
    // rather than leaving the user staring at an error.
  }

  return db.campaign.findFirst({
    where: { isActive: true },
    include: { municipality: true },
    orderBy: [{ createdAt: "asc" }],
  });
}

/**
 * The active campaign, or null when none exists yet. Pages that cannot do
 * anything useful without one should redirect to /campaigns.
 */
export async function getActiveCampaign() {
  return findActiveCampaign();
}

/**
 * The active campaign's id, for scoping a query. Throws when there is none —
 * callers that might run before setup should use getActiveCampaign() and handle
 * the null themselves.
 */
export async function requireCampaignId(): Promise<string> {
  const campaign = await findActiveCampaign();
  if (!campaign) throw new Error("No campaign has been set up yet");
  return campaign.id;
}

export async function listCampaigns() {
  return db.campaign.findMany({
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
