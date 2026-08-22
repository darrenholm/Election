import { db } from "./db";

/**
 * Slates: candidates running together who agree to pool what they learn at the
 * door.
 *
 * Two rules are enforced here rather than left to a setting:
 *
 *   1. SHARING IS RECIPROCAL. You see a slate-mate's canvass notes only if you
 *      are sharing yours. Nobody reads the slate without contributing to it.
 *   2. SOME THINGS ARE NEVER SHARED, whatever the slate agrees. Text-message
 *      consent is given to a named sender and cannot be transferred to another
 *      candidate; and finance is each campaign's own, with its own contribution
 *      limits and its own Form 4. Neither is reachable through any function in
 *      this file.
 *
 * What a slate does share is support levels and canvass notes — the things a
 * canvasser standing on a step benefits from knowing.
 */

export type SlateMate = {
  campaignId: string;
  candidateName: string;
  office: string;
};

/**
 * The campaigns whose canvass data this campaign may read: slate-mates who are
 * sharing, but only when this campaign is sharing too.
 */
export async function getSharingSlateMates(campaignId: string): Promise<SlateMate[]> {
  const memberships = await db.slateMembership.findMany({
    where: { campaignId },
    select: { slateId: true, sharesCanvassData: true },
  });

  const sharingSlateIds = memberships
    .filter((m) => m.sharesCanvassData)
    .map((m) => m.slateId);

  // Not sharing means not reading. This is the reciprocity rule, and it is a
  // guard rather than a filter so it cannot be forgotten at a call site.
  if (sharingSlateIds.length === 0) return [];

  const mates = await db.slateMembership.findMany({
    where: {
      slateId: { in: sharingSlateIds },
      sharesCanvassData: true,
      NOT: { campaignId },
    },
    include: {
      campaign: { select: { id: true, candidateName: true, office: true, isActive: true } },
    },
  });

  const seen = new Set<string>();
  const result: SlateMate[] = [];
  for (const mate of mates) {
    if (!mate.campaign.isActive) continue;
    if (seen.has(mate.campaign.id)) continue;
    seen.add(mate.campaign.id);
    result.push({
      campaignId: mate.campaign.id,
      candidateName: mate.campaign.candidateName,
      office: mate.campaign.office,
    });
  }
  return result;
}

export type SlateNote = {
  campaignId: string;
  candidateName: string;
  occurredAt: Date;
  result: string;
  supportLevel: number | null;
  notes: string;
};

/**
 * What slate-mates have learned about one voter. Every entry is attributed to
 * the campaign that recorded it — a canvasser needs to know whose conversation
 * they are reading, and it keeps the shared data visibly separate from their
 * own.
 */
export async function getSlateNotesForVoter(
  campaignId: string,
  voterId: string,
): Promise<SlateNote[]> {
  const mates = await getSharingSlateMates(campaignId);
  if (mates.length === 0) return [];

  const byId = new Map(mates.map((m) => [m.campaignId, m]));
  const contacts = await db.contactAttempt.findMany({
    where: { voterId, campaignId: { in: mates.map((m) => m.campaignId) } },
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  return contacts.map((c) => ({
    campaignId: c.campaignId,
    candidateName: byId.get(c.campaignId)?.candidateName ?? "Slate member",
    occurredAt: c.occurredAt,
    result: c.result,
    supportLevel: c.supportLevel,
    notes: c.notes,
  }));
}

/** Slate-mates' support levels for a set of voters, for the walk list. */
export async function getSlateSupport(
  campaignId: string,
  voterIds: string[],
): Promise<Map<string, { candidateName: string; supportLevel: number | null }[]>> {
  const result = new Map<string, { candidateName: string; supportLevel: number | null }[]>();
  if (voterIds.length === 0) return result;

  const mates = await getSharingSlateMates(campaignId);
  if (mates.length === 0) return result;

  const byId = new Map(mates.map((m) => [m.campaignId, m]));
  const states = await db.voterCampaignState.findMany({
    where: {
      voterId: { in: voterIds },
      campaignId: { in: mates.map((m) => m.campaignId) },
      supportLevel: { not: null },
    },
    select: { voterId: true, campaignId: true, supportLevel: true },
  });

  for (const state of states) {
    const list = result.get(state.voterId) ?? [];
    list.push({
      candidateName: byId.get(state.campaignId)?.candidateName ?? "Slate member",
      supportLevel: state.supportLevel,
    });
    result.set(state.voterId, list);
  }
  return result;
}

/** Every slate in a municipality, for the management page. */
export async function getSlates(municipalityId: string) {
  return db.slate.findMany({
    where: { municipalityId },
    include: {
      members: {
        include: {
          campaign: { select: { id: true, candidateName: true, office: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}
