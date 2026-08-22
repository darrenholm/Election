import twilio from "twilio";
import { db } from "@/lib/db";
import { isStartKeyword, isStopKeyword, normalisePhone } from "@/lib/consent";
import { smsConfig } from "@/lib/sms";

export const dynamic = "force-dynamic";

/**
 * Inbound texts from Twilio.
 *
 * This is how someone gets out, so it is written to be hard to break: a STOP
 * is recorded against the *number*, permanently, in its own table — not as a
 * flag on a voter row that a later import could overwrite. Any voter holding
 * that number is marked REVOKED as a convenience, but the block list is what
 * the sender actually checks.
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
  const body = String(params.Body ?? "");

  if (!from) return twiml("");

  if (isStopKeyword(body)) {
    await db.smsOptOut.upsert({
      where: { phone: from },
      create: { phone: from, reason: `Texted "${body.trim().slice(0, 40)}"` },
      update: { reason: `Texted "${body.trim().slice(0, 40)}"` },
    });
    await revokeVotersWithPhone(from, "REVOKED");

    // Twilio sends its own confirmation for standard STOP keywords on a
    // from-number, so replying here would double up.
    return twiml("");
  }

  if (isStartKeyword(body)) {
    await db.smsOptOut.deleteMany({ where: { phone: from } });
    // Deliberately not re-granting consent: opting back in to the carrier is
    // not the same as giving the campaign permission again, and re-consent
    // should be recorded properly with its wording.
    return twiml("");
  }

  // Anything else is a reply worth a human reading. Store it as a contact note
  // against the voter so it does not vanish into the provider's console.
  const voter = await findVoterByPhone(from);
  if (voter) {
    await db.contactAttempt.create({
      data: {
        voterId: voter.id,
        method: "TEXT",
        result: "SPOKE",
        notes: `Replied by text: ${body.trim().slice(0, 500)}`,
      },
    });
  }

  return twiml("");
}

async function findVoterByPhone(e164: string) {
  const voters = await db.voter.findMany({
    where: { NOT: { phone: "" } },
    select: { id: true, phone: true },
  });
  return voters.find((v) => normalisePhone(v.phone) === e164) ?? null;
}

async function revokeVotersWithPhone(e164: string, state: string) {
  const voters = await db.voter.findMany({
    where: { NOT: { phone: "" } },
    select: { id: true, phone: true },
  });
  const ids = voters.filter((v) => normalisePhone(v.phone) === e164).map((v) => v.id);
  if (ids.length > 0) {
    await db.voter.updateMany({ where: { id: { in: ids } }, data: { smsConsent: state } });
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
