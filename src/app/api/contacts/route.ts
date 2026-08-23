import { z } from "zod";
import { db } from "@/lib/db";
import { CONTACT_METHODS, CONTACT_RESULTS, SMS_CONSENT_STATES } from "@/lib/enums";
import { ENDORSEMENT_SCRIPT, normalisePhone } from "@/lib/consent";
import { createSignRequestForVoter } from "@/lib/sign-requests";
import { getActiveCampaign } from "@/lib/campaign";
import { upsertVoterState } from "@/lib/voter-state";

export const dynamic = "force-dynamic";

/**
 * Where a canvasser's phone posts a door.
 *
 * This is an API route rather than a server action because the mobile form has
 * to be able to *catch* a failure and hold the contact locally — a server
 * action that throws in a dead zone gives the client nothing useful to work
 * with. See src/lib/outbox.ts.
 *
 * Writes are idempotent on clientId, so the outbox can retry as often as it
 * likes without recording the same door twice.
 */
const Payload = z.object({
  clientId: z.string().min(1).max(100),
  /// One of voterId or householdId is required. A door with nobody on file is
  /// logged against the household; a phone call to somebody with no address is
  /// logged against the voter.
  voterId: z.string().min(1).nullable().optional(),
  householdId: z.string().min(1).nullable().optional(),
  /// Somebody met at the door who was not on the list. Creating them here is
  /// the whole point of canvassing before the clerk's list arrives.
  newPerson: z
    .object({
      firstName: z.string().max(100).default(""),
      lastName: z.string().max(100).default(""),
    })
    .nullable()
    .optional(),
  volunteerId: z.string().nullable().optional(),
  method: z.enum(Object.keys(CONTACT_METHODS) as [string, ...string[]]).default("DOOR"),
  result: z.enum(Object.keys(CONTACT_RESULTS) as [string, ...string[]]).default("SPOKE"),
  supportLevel: z.number().int().min(1).max(5).nullable().optional(),
  wantsSign: z.boolean().default(false),
  wantsToVolunteer: z.boolean().default(false),
  isDonorProspect: z.boolean().default(false),
  markDoNotContact: z.boolean().default(false),
  phone: z.string().max(40).default(""),
  email: z.string().max(200).default(""),
  smsConsent: z.enum(Object.keys(SMS_CONSENT_STATES) as [string, ...string[]]).default("UNKNOWN"),
  smsConsentWording: z.string().max(1000).default(""),
  notes: z.string().max(4000).default(""),
  /// Tri-state on purpose. False is "they were asked and said no", which is
  /// worth knowing; null is "it never came up", which is not the same thing.
  willEndorsePublicly: z.boolean().nullable().optional(),
  followUpNeeded: z.boolean().default(false),
  followUpReason: z.string().max(500).default(""),
  occurredAt: z.string().optional(),
});

export async function POST(request: Request) {
  const campaign = await getActiveCampaign();
  if (!campaign) {
    return Response.json({ error: "No campaign selected" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body was not JSON" }, { status: 400 });
  }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid contact", detail: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // A retry of something already stored is a success, not a duplicate.
  const existing = await db.contactAttempt.findUnique({
    where: { clientId: data.clientId },
    select: { id: true },
  });
  if (existing) return Response.json({ ok: true, id: existing.id, duplicate: true });

  if (!data.voterId && !data.householdId) {
    return Response.json({ error: "Need a voter or a household" }, { status: 400 });
  }

  // A household id from a phone is not trusted: it has to be in this campaign's
  // municipality, or a crafted request could log doors in another town.
  let household: { id: string } | null = null;
  if (data.householdId) {
    household = await db.household.findFirst({
      where: { id: data.householdId, municipalityId: campaign.municipalityId },
      select: { id: true },
    });
    if (!household) {
      return Response.json({ error: "Address no longer exists" }, { status: 404 });
    }
  }

  let voter: { id: string; phone: string; email: string } | null = null;
  if (data.voterId) {
    voter = await db.voter.findUnique({
      where: { id: data.voterId },
      select: { id: true, phone: true, email: true },
    });
    // 404 rather than 5xx: the outbox drops entries it can never deliver, and a
    // voter deleted since the door was knocked is exactly that case.
    if (!voter) return Response.json({ error: "Voter no longer exists" }, { status: 404 });
  } else if (
    household &&
    data.newPerson &&
    `${data.newPerson.firstName}${data.newPerson.lastName}`.trim() !== ""
  ) {
    // Somebody answered a door that had nobody on file. They become an elector
    // in this municipality, at this address — which is exactly what the
    // canvasser just learned.
    voter = await db.voter.create({
      data: {
        municipalityId: campaign.municipalityId,
        householdId: household.id,
        firstName: data.newPerson.firstName.trim(),
        lastName: data.newPerson.lastName.trim(),
        phone: data.phone.trim(),
        email: data.email.trim(),
      },
      select: { id: true, phone: true, email: true },
    });
  }

  const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

  const contact = await db.contactAttempt.create({
    data: {
      campaignId: campaign.id,
      clientId: data.clientId,
      voterId: voter?.id ?? null,
      householdId: household?.id ?? null,
      volunteerId: data.volunteerId ?? null,
      method: data.method,
      result: data.result,
      supportLevel: data.supportLevel ?? null,
      notes: data.notes,
      willEndorsePublicly: data.willEndorsePublicly ?? null,
      followUpNeeded: data.followUpNeeded,
      followUpReason: data.followUpNeeded ? data.followUpReason : "",
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    },
  });

  // A photo taken at this door may already be here: the phone queues the two
  // separately, so on a bad signal the picture can arrive before the door does.
  await db.canvassPhoto.updateMany({
    where: { clientId: data.clientId, campaignId: campaign.id, contactAttemptId: null },
    data: { contactAttemptId: contact.id },
  });

  // Everything below is about a person. A knock at a door where nobody was home
  // and nobody is on file is a complete record on its own — there is no one to
  // hold a support level or a consent.
  if (!voter) return Response.json({ ok: true, id: contact.id });

  // What this campaign learned about the voter.
  const state: Record<string, unknown> = {};
  if (data.supportLevel != null) state.supportLevel = data.supportLevel;
  if (data.wantsSign) state.wantsSign = true;
  if (data.wantsToVolunteer) state.wantsToVolunteer = true;
  if (data.isDonorProspect) state.isDonorProspect = true;
  if (data.result === "REFUSED" && data.markDoNotContact) state.doNotContact = true;

  // Permission to be named publicly, recorded like any other consent: with the
  // words they agreed to and the moment they agreed. A later "no" overrides an
  // earlier "yes" — withdrawing permission has to be as easy to record as
  // giving it, or the campaign ends up quoting somebody who asked it not to.
  if (data.willEndorsePublicly != null) {
    state.willEndorsePublicly = data.willEndorsePublicly;
    state.endorsementAt = new Date();
    state.endorsementWording = data.willEndorsePublicly ? ENDORSEMENT_SCRIPT : "";
  }

  // Consent is recorded with its wording and the moment it was given, and
  // belongs to this campaign alone — agreeing to hear from one candidate says
  // nothing about the others. DECLINED is stored as deliberately as GRANTED,
  // because knowing someone said no is what stops them being asked every
  // canvass.
  if (data.smsConsent === "GRANTED" || data.smsConsent === "DECLINED") {
    state.smsConsent = data.smsConsent;
    state.smsConsentAt = new Date();
    state.smsConsentSource = "DOOR";
    state.smsConsentWording = data.smsConsentWording;
  }

  // A number collected at the door is useless if it has already opted out of
  // this campaign's messages, so honour any standing opt-out immediately.
  const e164 = normalisePhone(data.phone || voter.phone);
  if (e164 && data.smsConsent === "GRANTED") {
    const optedOut = await db.smsOptOut.findUnique({
      where: { campaignId_phone: { campaignId: campaign.id, phone: e164 } },
    });
    if (optedOut) state.smsConsent = "REVOKED";
  }

  if (Object.keys(state).length > 0) {
    await upsertVoterState(campaign.id, voter.id, state);
  }

  // Facts about the person, true for every campaign in the municipality.
  const person: Record<string, unknown> = {};
  if (data.result === "MOVED") person.movedAway = true;
  if (data.result === "DECEASED") person.deceased = true;
  // Details collected at the door only ever fill gaps; they never overwrite
  // something already on file, which a canvasser cannot verify from the step.
  if (data.phone.trim() && !voter.phone.trim()) person.phone = data.phone.trim();
  if (data.email.trim() && !voter.email.trim()) person.email = data.email.trim();

  if (Object.keys(person).length > 0) {
    await db.voter.update({ where: { id: voter.id }, data: person });
  }

  if (data.wantsSign) await createSignRequestForVoter(campaign.id, voter.id);

  return Response.json({ ok: true, id: contact.id });
}
