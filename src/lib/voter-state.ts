import { db } from "./db";

/**
 * One campaign's view of one voter.
 *
 * The row is created on first write rather than up front: with six campaigns
 * and five thousand electors, materialising every pair would be thirty thousand
 * rows of mostly nothing. Absent means "this campaign has never formed a view",
 * which reads the same as the defaults.
 */
export async function upsertVoterState(
  campaignId: string,
  voterId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.voterCampaignState.upsert({
    where: { campaignId_voterId: { campaignId, voterId } },
    create: { campaignId, voterId, ...data },
    update: data,
  });
}

/** The defaults a voter has for a campaign that has never recorded anything. */
export const EMPTY_VOTER_STATE = {
  supportLevel: null as number | null,
  wantsSign: false,
  wantsToVolunteer: false,
  isDonorProspect: false,
  doNotContact: false,
  votedAt: null as Date | null,
  smsConsent: "UNKNOWN",
  smsConsentAt: null as Date | null,
  smsConsentSource: "",
  smsConsentWording: "",
  willEndorsePublicly: false,
  endorsementAt: null as Date | null,
  endorsementWording: "",
  tags: "",
  notes: "",
};

export type VoterStateLike = typeof EMPTY_VOTER_STATE;

/** Read a state row's fields, falling back to the defaults when absent. */
export function stateOf<T extends Partial<VoterStateLike>>(
  state: T | null | undefined,
): VoterStateLike {
  return { ...EMPTY_VOTER_STATE, ...(state ?? {}) };
}
