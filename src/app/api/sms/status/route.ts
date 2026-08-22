import twilio from "twilio";
import { db } from "@/lib/db";
import { smsConfig } from "@/lib/sms";

export const dynamic = "force-dynamic";

/**
 * Twilio's delivery callbacks. Turns "we handed it to the carrier" into "it
 * actually arrived", which is the only number worth reporting to a candidate.
 */
const TERMINAL: Record<string, string> = {
  delivered: "DELIVERED",
  undelivered: "UNDELIVERED",
  failed: "FAILED",
  sent: "SENT",
};

export async function POST(request: Request) {
  const config = smsConfig();
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  if (config.authToken) {
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const url = process.env.APP_URL ? `${process.env.APP_URL}/api/sms/status` : request.url;
    if (!twilio.validateRequest(config.authToken, signature, url, params)) {
      return new Response("Signature check failed", { status: 403 });
    }
  }

  const sid = String(params.MessageSid ?? params.SmsSid ?? "");
  const status = TERMINAL[String(params.MessageStatus ?? "").toLowerCase()];
  if (!sid || !status) return new Response("", { status: 204 });

  await db.textMessage.updateMany({
    where: { providerSid: sid },
    data: {
      status,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      errorMessage: params.ErrorMessage ? String(params.ErrorMessage).slice(0, 500) : undefined,
    },
  });

  return new Response("", { status: 204 });
}
