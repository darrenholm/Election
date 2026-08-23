import { getAccessibleCampaigns, getCurrentUser, hasRole } from "./auth";
import { type Role } from "./roles";
import { db } from "./db";

/**
 * Ownership checks for actions that are handed a record id.
 *
 * A server action is a public endpoint. `requireCampaignId()` protects anything
 * created against the *active* campaign, but an action that takes an id —
 * `deleteExpense(expenseId)`, `sendBatch(textCampaignId)` — is only as safe as
 * the caller is honest. Without a check here, a canvasser on one campaign can
 * edit a rival's spending limits, delete their donors, or send texts from their
 * number, all by passing an id the app never meant them to hold.
 *
 * Every helper answers the same question: does this record belong to a campaign
 * the signed-in user may act on? They return null (or false) rather than
 * throwing, because the actions they guard already treat "nothing to do" as a
 * silent no-op, and an error page tells an attacker more than silence does.
 */

/** The campaign-scoped models: every one of these carries a campaignId. */
export type OwnedRecord =
  | "contactAttempt"
  | "contribution"
  | "contributor"
  | "event"
  | "expense"
  | "shift"
  | "signRequest"
  | "textCampaign"
  | "turf"
  | "volunteer";

/** Which campaign a record belongs to, or null when it does not exist. */
async function campaignIdOf(kind: OwnedRecord, id: string): Promise<string | null> {
  if (!id) return null;
  const where = { id };

  switch (kind) {
    case "contactAttempt":
      return (await db.contactAttempt.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "contribution":
      return (await db.contribution.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "contributor":
      return (await db.contributor.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "event":
      return (await db.event.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "expense":
      return (await db.expense.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "shift":
      return (await db.shift.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "signRequest":
      return (await db.signRequest.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "textCampaign":
      return (await db.textCampaign.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "turf":
      return (await db.turf.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
    case "volunteer":
      return (await db.volunteer.findUnique({ where, select: { campaignId: true } }))?.campaignId ?? null;
  }
}

/**
 * The campaign this record belongs to, once the caller has been confirmed to
 * hold at least `minimum` on it. Null means "do nothing": either the record is
 * gone, or it is none of this user's business — deliberately the same answer,
 * so a guessed id cannot be used to find out which.
 */
export async function requireOwned(
  kind: OwnedRecord,
  id: string,
  minimum: Role = "CANVASSER",
): Promise<string | null> {
  const campaignId = await campaignIdOf(kind, id);
  if (!campaignId) return null;
  return (await hasRole(campaignId, minimum)) ? campaignId : null;
}

/** The same check, for an action already holding a campaign id. */
export async function requireCampaign(
  campaignId: string,
  minimum: Role = "CANVASSER",
): Promise<string | null> {
  if (!campaignId) return null;
  return (await hasRole(campaignId, minimum)) ? campaignId : null;
}

/**
 * A shift assignment, reached through its shift. Assignments carry no campaign
 * of their own, and the actions that touch them need the ids back anyway to
 * revalidate the right pages.
 */
export async function requireAssignment(
  assignmentId: string,
  minimum: Role = "CANVASSER",
): Promise<{ id: string; shiftId: string; volunteerId: string } | null> {
  if (!assignmentId) return null;

  const assignment = await db.shiftAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, shiftId: true, volunteerId: true, shift: { select: { campaignId: true } } },
  });
  if (!assignment) return null;
  if (!(await hasRole(assignment.shift.campaignId, minimum))) return null;

  return { id: assignment.id, shiftId: assignment.shiftId, volunteerId: assignment.volunteerId };
}

/**
 * Doors and electors belong to the municipality, not to a campaign, so the test
 * for editing one is whether the user runs any campaign in that town. Editing a
 * voter is shared ground by design — every candidate there works the same list.
 */
export async function canReachMunicipality(
  municipalityId: string,
  minimum: Role = "CANVASSER",
): Promise<boolean> {
  if (!municipalityId) return false;

  const user = await getCurrentUser();
  if (!user) return false;
  if (user.isAdmin) return true;

  const campaigns = await getAccessibleCampaigns();
  for (const campaign of campaigns) {
    if (campaign.municipalityId !== municipalityId) continue;
    if (await hasRole(campaign.id, minimum)) return true;
  }
  return false;
}

/** The municipality a voter is on, once the caller is confirmed to reach it. */
export async function requireVoterMunicipality(
  voterId: string,
  minimum: Role = "CANVASSER",
): Promise<string | null> {
  if (!voterId) return null;

  const voter = await db.voter.findUnique({
    where: { id: voterId },
    select: { municipalityId: true },
  });
  if (!voter) return null;
  return (await canReachMunicipality(voter.municipalityId, minimum)) ? voter.municipalityId : null;
}

/** The same, for a household. */
export async function requireHouseholdMunicipality(
  householdId: string,
  minimum: Role = "CANVASSER",
): Promise<string | null> {
  if (!householdId) return null;

  const household = await db.household.findUnique({
    where: { id: householdId },
    select: { municipalityId: true },
  });
  if (!household) return null;
  return (await canReachMunicipality(household.municipalityId, minimum))
    ? household.municipalityId
    : null;
}

/** True when the user runs anything at all — the bar for a shared, costly job. */
export async function hasAnyCampaign(minimum: Role = "CANVASSER"): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.isAdmin) return true;

  const campaigns = await getAccessibleCampaigns();
  for (const campaign of campaigns) {
    if (await hasRole(campaign.id, minimum)) return true;
  }
  return false;
}
