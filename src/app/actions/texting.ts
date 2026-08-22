"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCampaign } from "@/lib/campaign";
import { countSegments, normalisePhone } from "@/lib/consent";
import {
  buildAudience,
  composeBody,
  estimateCostCents,
  sendCampaignBatch,
  smsConfig,
  type SendBatchResult,
} from "@/lib/sms";
import { bool, list, str } from "@/lib/form";

function refresh(id?: string) {
  revalidatePath("/texting");
  if (id) revalidatePath(`/texting/${id}`);
  revalidatePath("/voters");
}

/** Audience filter as stored on the campaign, so a send can be explained later. */
type AudienceFilter = {
  supportLevels: number[];
  streets: string[];
  turfIds: string[];
  tag: string;
};

function readFilter(formData: FormData): AudienceFilter {
  return {
    supportLevels: list(formData, "supportLevels")
      .map(Number)
      .filter((n) => n >= 1 && n <= 5),
    streets: list(formData, "streets"),
    turfIds: list(formData, "turfIds"),
    tag: str(formData, "tag"),
  };
}

/** Live count and cost for the composer, without creating anything. */
export async function previewAudience(formData: FormData) {
  const filter = readFilter(formData);
  const body = str(formData, "body");
  const campaign = await getCampaign();
  const config = smsConfig();

  const audience = await buildAudience(filter);
  const bodies = audience.map((m) => composeBody(body, m, campaign.candidateName));
  const sample = bodies[0] ?? composeBody(body, null, campaign.candidateName);

  return {
    recipients: audience.length,
    segments: countSegments(sample).segments,
    encoding: countSegments(sample).encoding,
    offenders: countSegments(sample).offenders,
    sample,
    estimatedCostCents: estimateCostCents(bodies, config.perSegmentCents),
    configured: config.configured,
  };
}

/**
 * Create a campaign and queue one message per recipient up front, so the send
 * itself is just working through rows and can stop and resume safely.
 */
export async function createTextCampaign(formData: FormData) {
  const name = str(formData, "name") || "Untitled message";
  const body = str(formData, "body");
  if (body.trim() === "") return;

  const filter = readFilter(formData);
  const campaign = await getCampaign();
  const config = smsConfig();

  const audience = await buildAudience(filter);
  const rendered = audience.map((member) => ({
    member,
    body: composeBody(body, member, campaign.candidateName),
  }));

  const created = await db.textCampaign.create({
    data: {
      name,
      body,
      status: bool(formData, "queueNow") ? "QUEUED" : "DRAFT",
      audienceFilter: JSON.stringify(filter),
      estimatedCostCents: estimateCostCents(
        rendered.map((r) => r.body),
        config.perSegmentCents,
      ),
    },
  });

  if (rendered.length > 0) {
    await db.textMessage.createMany({
      data: rendered.map((r) => ({
        campaignId: created.id,
        voterId: r.member.voterId,
        toPhone: r.member.phone,
        body: r.body,
        segments: countSegments(r.body).segments,
      })),
    });
  }

  refresh(created.id);
  redirect(`/texting/${created.id}`);
}

/** Move a draft into the queue so it can be sent. */
export async function queueCampaign(campaignId: string) {
  await db.textCampaign.update({
    where: { id: campaignId },
    data: { status: "QUEUED" },
  });
  refresh(campaignId);
}

export async function cancelCampaign(campaignId: string) {
  // Only untouched messages are cancelled; anything already sent has gone.
  await db.textMessage.updateMany({
    where: { campaignId, status: "QUEUED" },
    data: { status: "SKIPPED", errorMessage: "Campaign cancelled" },
  });
  await db.textCampaign.update({
    where: { id: campaignId },
    data: { status: "CANCELLED" },
  });
  refresh(campaignId);
}

export async function deleteCampaign(campaignId: string) {
  await db.textCampaign.delete({ where: { id: campaignId } });
  revalidatePath("/texting");
  redirect("/texting");
}

/** Send one batch. The campaign page calls this in a loop with a stop button. */
export async function sendBatch(campaignId: string, limit = 25): Promise<SendBatchResult> {
  const campaign = await db.textCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      dryRun: true,
      errors: ["Campaign no longer exists"],
    };
  }

  if (campaign.status === "DRAFT" || campaign.status === "CANCELLED") {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      dryRun: !smsConfig().configured,
      errors: ["Queue the campaign before sending"],
    };
  }

  await db.textCampaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
  const result = await sendCampaignBatch(campaignId, limit);
  refresh(campaignId);
  return result;
}

/* -------------------------------------------------------------- consent ops */

/** Record consent from somewhere other than the door — a form, a phone call. */
export async function setVoterConsent(voterId: string, formData: FormData) {
  const state = str(formData, "smsConsent");
  if (!["UNKNOWN", "GRANTED", "DECLINED", "REVOKED"].includes(state)) return;

  await db.voter.update({
    where: { id: voterId },
    data: {
      smsConsent: state,
      smsConsentAt: state === "UNKNOWN" ? null : new Date(),
      smsConsentSource: state === "UNKNOWN" ? "" : str(formData, "smsConsentSource") || "PHONE",
      smsConsentWording: state === "UNKNOWN" ? "" : str(formData, "smsConsentWording"),
    },
  });

  revalidatePath(`/voters/${voterId}`);
  revalidatePath("/texting");
}

/**
 * Add a number to the permanent opt-out list by hand — for someone who asks to
 * be taken off by phone or in person rather than by texting STOP.
 */
export async function addOptOut(formData: FormData) {
  const e164 = normalisePhone(str(formData, "phone"));
  if (!e164) return;

  await db.smsOptOut.upsert({
    where: { phone: e164 },
    create: { phone: e164, reason: str(formData, "reason") || "Asked to be removed" },
    update: { reason: str(formData, "reason") || "Asked to be removed" },
  });

  // Reflect it on any voter carrying that number, so the roster agrees with
  // the block list rather than quietly disagreeing.
  const voters = await db.voter.findMany({ where: { NOT: { phone: "" } }, select: { id: true, phone: true } });
  const ids = voters.filter((v) => normalisePhone(v.phone) === e164).map((v) => v.id);
  if (ids.length > 0) {
    await db.voter.updateMany({ where: { id: { in: ids } }, data: { smsConsent: "REVOKED" } });
  }

  revalidatePath("/texting");
  revalidatePath("/texting/consent");
}

export async function removeOptOut(phone: string) {
  await db.smsOptOut.deleteMany({ where: { phone } });
  revalidatePath("/texting/consent");
}
