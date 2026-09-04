import twilio from "twilio";
import { db } from "@/lib/db";
import { isStartKeyword, isStopKeyword, normalisePhone } from "@/lib/consent";
import { smsConfig } from "@/lib/sms";
import { upsertVoterState } from "@/lib/voter-state";

export const dynamic = "force-dynamic";

/**
 * Inbound texts from Twilio.
 *
 * This is how someone gets out, so it is written to be hard to break: a STOP
 * is recorded against the *number*, permanently, in its own table — not as a
 * flag on a voter row that a later import could overwrite. Any voter holding
 * that number is marked REVOKED for that campaign as a convenience, but the
 * block list is what the sender actually checks.
 *
 * Opt-outs are per campaign, because consent runs to a named sender: telling
 * one candidate to stop is not instruction to the other five. The receiving
 * number tells us which candidate is being replied to, which is why each
 * campaign needs its own.
 *
 * Twilio also stops delivery on STOP at its end for a plain from-number. We do
 * not rely on that: a messaging service, a number change, or a switch of
 * provider would all quietly lose it.
 */
export async function POST(request: Request) {
  const config = smsConfig();
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  // Verify the request really came from Twilio before acting on it. Skipped
  // when no auth token is configured, which is the dry-run case.
  if (config.authToken) {
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const url = process.env.APP_URL
      ? `${process.env.APP_URL}/api/sms/webhook`
      : request.url;

    const valid = twilio.validateRequest(config.authToken, signature, url, params);
    if (!valid) {
      return new Response("Signature check failed", { status: 403 });
    }
  }

  const from = normalisePhone(String(params.From ?? ""));
  const to = normalisePhone(String(params.To ?? ""));
  const body = String(params.Body ?? "");

  if (!from) return twiml("");

  // Which candidate was this sent to? Each campaign texts from its own number,
  // so the receiving number identifies the sender the voter is replying to.
  // Without that we cannot tell whose list to remove them from, and guessing
  // would either under-honour the opt-out or wrongly cut them from campaigns
  // they never contacted.
  const campaign = to
    ? await db.campaign.findFirst({
        where: {
          OR: [
            { twilioFromNumber: to },
            { twilioFromNumber: String(params.To ?? "") },
            { twilioMessagingServiceSid: String(params.MessagingServiceSid ?? "___none___") },
          ],
        },
      })
    : null;

  // Fall back to the only campaign when there is exactly one — the common case
  // for a single-candidate install, where a number has not been configured.
  const resolved =
    campaign ??
    ((await db.campaign.count({ where: { isActive: true } })) === 1
      ? await db.campaign.findFirst({ where: { isActive: true } })
      : null);

  if (!resolved) {
    // Better to record nothing than to opt someone out of the wrong campaign,
    // or out of all six. 200 so Twilio does not retry a request we will never
    // be able to attribute.
    return twiml("");
  }

  if (isStopKeyword(body)) {
    const reason = `Texted "${body.trim().slice(0, 40)}"`;
    await db.smsOptOut.upsert({
      where: { campaignId_phone: { campaignId: resolved.id, phone: from } },
      create: { campaignId: resolved.id, phone: from, reason },
      update: { reason },
    });
    await setConsentForPhone(resolved.id, from, "REVOKED");

    // Twilio sends its own confirmation for standard STOP keywords on a
    // from-number, so replying here would double up.
    return twiml("");
  }

  if (isStartKeyword(body)) {
    await db.smsOptOut.deleteMany({ where: { campaignId: resolved.id, phone: from } });
    // Deliberately not re-granting consent: opting back in with the carrier is
    // not the same as giving the campaign permission again, and re-consent
    // should be recorded properly with its wording.
    return twiml("");
  }

  // Anything else is a reply worth a human reading. Store it as a contact
  // against the voter so it does not vanish into the provider's console.
  const voter = await findVoterByPhone(resolved.id, from);
  if (voter) {
    await db.contactAttempt.create({
      data: {
        campaignId: resolved.id,
        voterId: voter.id,
        method: "TEXT",
        result: "SPOKE",
        notes: `Replied by text: ${body.trim().slice(0, 500)}`,
      },
    });
  }

  return twiml("");
}

/**
 * Numbers are held per campaign, so an inbound text is matched against this
 * campaign's own records. It could not sensibly be otherwise: a reply to one
 * candidate's message is not evidence about anybody else's contact list.
 */
async function findVoterByPhone(campaignId: string, e164: string) {
  const states = await db.voterCampaignState.findMany({
    where: { campaignId, NOT: { phone: "" } },
    select: { voterId: true, phone: true },
  });
  const match = states.find((s) => normalisePhone(s.phone) === e164);
  return match ? { id: match.voterId } : null;
}

async function setConsentForPhone(campaignId: string, e164: string, state: string) {
  const states = await db.voterCampaignState.findMany({
    where: { campaignId, NOT: { phone: "" } },
    select: { voterId: true, phone: true },
  });
  for (const s of states) {
    if (normalisePhone(s.phone) === e164) {
      await upsertVoterState(campaignId, s.voterId, { smsConsent: state });
    }
  }
}

function twiml(message: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
