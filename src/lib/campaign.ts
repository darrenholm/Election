import { db } from "./db";
import { computeLimits, type LimitSet } from "./ontario";

export const CAMPAIGN_ID = "campaign";

export type Campaign = Awaited<ReturnType<typeof getCampaign>>;

/**
 * The campaign row is a singleton. Reading it lazily creates a placeholder so
 * a fresh database is usable before anyone visits Settings; the dashboard
 * prompts for the real values.
 */
export async function getCampaign() {
  const existing = await db.campaign.findUnique({ where: { id: CAMPAIGN_ID } });
  if (existing) return existing;

  // Ontario municipal elections are held on the fourth Monday of October in
  // the election year. Default to the next one so the countdown is sensible
  // before anyone has filled in Settings.
  const votingDay = nextOntarioVotingDay();
  return db.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      candidateName: "",
      office: "COUNCILLOR",
      votingDay,
      campaignPeriodStart: new Date(votingDay.getFullYear(), 0, 2),
    },
  });
}

export async function getLimits(): Promise<LimitSet & { campaign: Campaign }> {
  const campaign = await getCampaign();
  return { ...computeLimits(campaign), campaign };
}

/** Fourth Monday of October in the next Ontario municipal election year. */
export function nextOntarioVotingDay(from: Date = new Date()): Date {
  // Elections run every four years; 2022 and 2026 are election years.
  let year = from.getFullYear();
  year = year + ((2026 - year) % 4 + 4) % 4;
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
