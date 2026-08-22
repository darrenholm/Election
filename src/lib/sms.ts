import twilio from "twilio";
import { db } from "./db";
import { OPT_OUT_SUFFIX, countSegments, normalisePhone, renderMessage } from "./consent";
import { requireCampaignId } from "./campaign";

/**
 * Sending text messages through Twilio.
 *
 * Three rules are enforced here rather than in the UI, because the UI is the
 * easy place to make a mistake and this is the last gate before a message
 * actually leaves:
 *
 *   1. Only voters whose consent is GRANTED are ever sent to.
 *   2. Any number on the opt-out list is skipped, whatever the voter record
 *      says — a STOP is about the handset, not the person.
 *   3. Every message carries a way out.
 *
 * With no credentials configured the whole pipeline still runs and marks
 * messages as a dry run, so a campaign can build and check an entire send
 * before opening a Twilio account.
 */

export type SmsConfig = {
  configured: boolean;
  accountSid: string;
  authToken: string;
  /** A messaging service is preferred; a plain from-number also works. */
  messagingServiceSid: string;
  fromNumber: string;
  perSegmentCents: number;
};

export function smsConfig(): SmsConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  const perSegmentCents = Number(process.env.SMS_PER_SEGMENT_CENTS ?? "1");

  return {
    configured: Boolean(accountSid && authToken && (messagingServiceSid || fromNumber)),
    accountSid,
    authToken,
    messagingServiceSid,
    fromNumber,
    perSegmentCents: Number.isFinite(perSegmentCents) ? perSegmentCents : 1,
  };
}

function client() {
  const config = smsConfig();
  if (!config.configured) return null;
  return twilio(config.accountSid, config.authToken);
}

/**
 * The message as it will actually go out: merge fields filled, the campaign's
 * own name on the front so the recipient knows who is texting, and the opt-out
 * on the end.
 */
export function composeBody(
  template: string,
  voter: { firstName: string; lastName: string } | null,
  senderName: string,
): string {
  const rendered = renderMessage(template, voter);
  const parts = [rendered.trim()];

  // Identify the sender unless the body already does.
  if (senderName && !rendered.toLowerCase().includes(senderName.toLowerCase())) {
    parts.push(`— ${senderName}`);
  }
  if (!rendered.toUpperCase().includes("STOP")) parts.push(OPT_OUT_SUFFIX);

  return parts.join(" ");
}

export type AudienceMember = {
  voterId: string;
  phone: string;
  firstName: string;
  lastName: string;
};

/**
 * Everyone lawfully textable right now. Deliberately narrow: express consent,
 * a usable number, not opted out, not deceased or moved, not do-not-contact.
 */
export async function buildAudience(
  filter: {
    supportLevels?: number[];
    streets?: string[];
    turfIds?: string[];
    tag?: string;
  },
  campaignIdOverride?: string,
): Promise<AudienceMember[]> {
  const campaignId = campaignIdOverride ?? (await requireCampaignId());

  // Consent, support and do-not-contact are all this campaign's own record, so
  // the audience is driven from VoterCampaignState rather than from the shared
  // voter row. A voter who agreed to hear from one candidate has said nothing
  // about the others.
  const states = await db.voterCampaignState.findMany({
    where: {
      campaignId,
      smsConsent: "GRANTED",
      doNotContact: false,
      voter: {
        deceased: false,
        movedAway: false,
        NOT: { phone: "" },
        ...(filter.streets && filter.streets.length > 0
          ? { household: { is: { streetKey: { in: filter.streets } } } }
          : {}),
        ...(filter.turfIds && filter.turfIds.length > 0
          ? { household: { is: { turfHouseholds: { some: { turfId: { in: filter.turfIds } } } } } }
          : {}),
      },
      ...(filter.supportLevels && filter.supportLevels.length > 0
        ? { supportLevel: { in: filter.supportLevels } }
        : {}),
      ...(filter.tag ? { tags: { contains: filter.tag } } : {}),
    },
    select: {
      voter: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });

  const voters = states.map((s) => s.voter);

  const optOuts = new Set(
    (await db.smsOptOut.findMany({ where: { campaignId }, select: { phone: true } })).map(
      (o) => o.phone,
    ),
  );

  const seen = new Set<string>();
  const audience: AudienceMember[] = [];

  for (const voter of voters) {
    const e164 = normalisePhone(voter.phone);
    if (!e164) continue;
    if (optOuts.has(e164)) continue;
    // Two people in a household often share a number; text it once.
    if (seen.has(e164)) continue;
    seen.add(e164);
    audience.push({
      voterId: voter.id,
      phone: e164,
      firstName: voter.firstName,
      lastName: voter.lastName,
    });
  }

  return audience;
}

export type SendBatchResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  dryRun: boolean;
  errors: string[];
};

/**
 * Send one batch of a queued campaign. Batched for the same reason geocoding
 * is: a few hundred messages take longer than any sensible request timeout,
 * and a partial send must be resumable without texting anyone twice.
 */
export async function sendCampaignBatch(
  textCampaignId: string,
  limit = 25,
): Promise<SendBatchResult> {
  const config = smsConfig();
  const api = client();

  const send = await db.textCampaign.findUnique({
    where: { id: textCampaignId },
    include: { campaign: true },
  });
  if (!send) {
    return { attempted: 0, sent: 0, failed: 0, skipped: 0, remaining: 0, dryRun: true, errors: ["Send not found"] };
  }
  const campaignId = send.campaignId;

  const queued = await db.textMessage.findMany({
    where: { textCampaignId, status: "QUEUED" },
    take: limit,
    include: {
      voter: {
        select: { campaignStates: { where: { campaignId }, select: { smsConsent: true } } },
      },
    },
  });

  const result: SendBatchResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    dryRun: !config.configured,
    errors: [],
  };

  for (const message of queued) {
    result.attempted++;

    // Re-check consent and opt-out at the moment of sending. Someone may have
    // texted STOP, or had their consent revoked, between queueing and now.
    const optedOut = await db.smsOptOut.findUnique({
      where: { campaignId_phone: { campaignId, phone: message.toPhone } },
    });
    const consentGone =
      message.voter !== null &&
      (message.voter.campaignStates[0]?.smsConsent ?? "UNKNOWN") !== "GRANTED";

    if (optedOut || consentGone) {
      await db.textMessage.update({
        where: { id: message.id },
        data: {
          status: "SKIPPED",
          errorMessage: optedOut ? "Number has opted out" : "Consent withdrawn before sending",
        },
      });
      result.skipped++;
      continue;
    }

    if (!api) {
      await db.textMessage.update({
        where: { id: message.id },
        data: { status: "SENT", providerSid: "DRY-RUN", sentAt: new Date() },
      });
      result.sent++;
      continue;
    }

    try {
      const sent = await api.messages.create({
        to: message.toPhone,
        body: message.body,
        // Each candidate sends from their own identity: consent runs to a named
        // sender, and a shared number would make every opt-out ambiguous.
        ...(send.campaign.twilioMessagingServiceSid
          ? { messagingServiceSid: send.campaign.twilioMessagingServiceSid }
          : send.campaign.twilioFromNumber
            ? { from: send.campaign.twilioFromNumber }
            : config.messagingServiceSid
              ? { messagingServiceSid: config.messagingServiceSid }
              : { from: config.fromNumber }),
        ...(process.env.APP_URL
          ? { statusCallback: `${process.env.APP_URL}/api/sms/status` }
          : {}),
      });

      await db.textMessage.update({
        where: { id: message.id },
        data: { status: "SENT", providerSid: sent.sid, sentAt: new Date() },
      });
      result.sent++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Send failed";
      await db.textMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", errorMessage: reason.slice(0, 500) },
      });
      result.failed++;
      if (result.errors.length < 10) result.errors.push(`${message.toPhone}: ${reason}`);
    }
  }

  result.remaining = await db.textMessage.count({
    where: { textCampaignId, status: "QUEUED" },
  });

  if (result.remaining === 0) {
    await db.textCampaign.update({
      where: { id: textCampaignId },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  return result;
}

/** What a send will cost, from the real segment count of each rendered body. */
export function estimateCostCents(bodies: string[], perSegmentCents: number): number {
  return bodies.reduce((total, body) => total + countSegments(body).segments * perSegmentCents, 0);
}
