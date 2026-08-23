"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign, requireCampaignId } from "@/lib/campaign";
import { requireCampaign, requireOwned } from "@/lib/guard";
import { POST_KINDS, POST_STATUSES, joinList, type PostKind } from "@/lib/enums";
import { date, int, list, oneOf, str, strOrNull } from "@/lib/form";
import { FACEBOOK_HANDOFF_COOKIE, listPages, publishToPage } from "@/lib/facebook";
import { generateSlots, planDefaults, starterBody, type PlanShape } from "@/lib/post-plan";
import { readSignedValue } from "@/lib/session";

/**
 * The Facebook section.
 *
 * Everything here is manager-and-up, for the same reason texting is: a post
 * goes out over the candidate's own name to everyone who follows them, and a
 * canvasser with a login has no business speaking for the campaign in public.
 */

function refresh(postId?: string) {
  revalidatePath("/social");
  if (postId) revalidatePath(`/social/${postId}`);
}

/* ------------------------------------------------------------------ the plan */

function planFromForm(formData: FormData, fallback: PlanShape): PlanShape {
  const days = joinList(list(formData, "daysOfWeek"));
  const rampDays = joinList(list(formData, "rampDaysOfWeek"));
  const mix = joinList(list(formData, "mix").filter((kind) => kind in POST_KINDS));

  return {
    daysOfWeek: days || fallback.daysOfWeek,
    timeOfDay: str(formData, "timeOfDay") || fallback.timeOfDay,
    rampWeeks: Math.max(0, Math.min(8, int(formData, "rampWeeks"))),
    rampDaysOfWeek: rampDays || fallback.rampDaysOfWeek,
    startsOn: date(formData, "startsOn") ?? fallback.startsOn,
    endsOn: date(formData, "endsOn") ?? fallback.endsOn,
    mix: mix || fallback.mix,
  };
}

/**
 * Save the cadence and lay out the schedule.
 *
 * Regenerating only clears slots nobody has touched — a SUGGESTED post still
 * in the future. Anything edited, approved, posted or deliberately skipped
 * survives a change of cadence, because the whole point of the drafts is that
 * they get rewritten and losing that work would teach the candidate never to
 * touch the plan again.
 */
export async function savePlan(formData: FormData) {
  const campaign = await getActiveCampaign();
  if (!campaign) return;
  if (!(await requireCampaign(campaign.id, "MANAGER"))) return;

  const existing = await db.postPlan.findUnique({ where: { campaignId: campaign.id } });
  const shape = planFromForm(
    formData,
    existing ?? planDefaults(campaign, campaign.campaignPeriodStart),
  );

  const plan = await db.postPlan.upsert({
    where: { campaignId: campaign.id },
    create: { campaignId: campaign.id, ...shape },
    update: shape,
  });

  await rebuildSchedule(campaign.id, plan.id, shape, campaign);
  refresh();
}

/** Same thing without saving new settings — "lay it out again from today". */
export async function regenerateSchedule() {
  const campaign = await getActiveCampaign();
  if (!campaign) return;
  if (!(await requireCampaign(campaign.id, "MANAGER"))) return;

  const plan = await db.postPlan.findUnique({ where: { campaignId: campaign.id } });
  if (!plan) return;

  await rebuildSchedule(campaign.id, plan.id, plan, campaign);
  refresh();
}

type CampaignForPlan = Parameters<typeof starterBody>[1];

async function rebuildSchedule(
  campaignId: string,
  planId: string,
  shape: PlanShape,
  campaign: CampaignForPlan,
) {
  // Untouched suggestions from today onwards are the only thing thrown away.
  await db.socialPost.deleteMany({
    where: { campaignId, planId, status: "SUGGESTED", scheduledFor: { gte: new Date() } },
  });

  const taken = await db.socialPost.findMany({
    where: { campaignId, scheduledFor: { gte: new Date() } },
    select: { scheduledFor: true },
  });
  const occupied = new Set(taken.map((post) => post.scheduledFor.getTime()));

  const slots = generateSlots(shape).filter((slot) => !occupied.has(slot.scheduledFor.getTime()));
  if (slots.length === 0) return;

  await db.socialPost.createMany({
    data: slots.map((slot) => ({
      campaignId,
      planId,
      kind: slot.kind,
      scheduledFor: slot.scheduledFor,
      body: starterBody(slot.kind, campaign),
      status: "SUGGESTED",
    })),
  });
}

/* ----------------------------------------------------------------- one post */

export async function addPost(formData: FormData) {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;

  const scheduledFor = date(formData, "scheduledFor") ?? new Date();
  const kind = oneOf(formData, "kind", POST_KINDS, "UPDATE") as PostKind;

  const post = await db.socialPost.create({
    data: {
      campaignId,
      kind,
      scheduledFor,
      body: str(formData, "body"),
      linkUrl: str(formData, "linkUrl"),
      imageUrl: str(formData, "imageUrl"),
      eventId: strOrNull(formData, "eventId"),
      status: "DRAFT",
    },
  });

  refresh();
  redirect(`/social/${post.id}`);
}

export async function updatePost(postId: string, formData: FormData) {
  if (!(await requireOwned("socialPost", postId, "MANAGER"))) return;

  const existing = await db.socialPost.findUnique({ where: { id: postId } });
  if (!existing) return;
  // Nothing is edited after it has gone out; the record of what was posted has
  // to stay the record of what was posted.
  if (existing.status === "PUBLISHED") return;

  const body = str(formData, "body");

  await db.socialPost.update({
    where: { id: postId },
    data: {
      kind: oneOf(formData, "kind", POST_KINDS, existing.kind as PostKind),
      scheduledFor: date(formData, "scheduledFor") ?? existing.scheduledFor,
      body,
      linkUrl: str(formData, "linkUrl"),
      imageUrl: str(formData, "imageUrl"),
      eventId: strOrNull(formData, "eventId"),
      // Once a human has been at it, it is no longer the machine's suggestion.
      status: existing.status === "SUGGESTED" ? "DRAFT" : existing.status,
    },
  });

  refresh(postId);
}

export async function setPostStatus(postId: string, status: string) {
  if (!(await requireOwned("socialPost", postId, "MANAGER"))) return;
  if (!(status in POST_STATUSES)) return;
  // Approving and skipping are the two a button offers; the rest are the
  // publisher's to set.
  if (!["DRAFT", "APPROVED", "SKIPPED"].includes(status)) return;

  const existing = await db.socialPost.findUnique({ where: { id: postId } });
  if (!existing || existing.status === "PUBLISHED") return;

  await db.socialPost.update({ where: { id: postId }, data: { status } });
  refresh(postId);
}

export async function deletePost(postId: string) {
  if (!(await requireOwned("socialPost", postId, "MANAGER"))) return;

  await db.socialPost.delete({ where: { id: postId } });
  revalidatePath("/social");
  redirect("/social");
}

/* --------------------------------------------------------------- publishing */

export type PublishOutcome = {
  published: number;
  failed: number;
  dryRun: boolean;
  errors: string[];
};

const NOTHING: PublishOutcome = { published: 0, failed: 0, dryRun: false, errors: [] };

/**
 * Put one post on the Page now.
 *
 * A post that already carries a Facebook id is left alone whatever its status
 * says: a retry after a timeout must not put the same thing on the Page twice.
 */
async function publishOne(postId: string): Promise<PublishOutcome> {
  const post = await db.socialPost.findUnique({
    where: { id: postId },
    include: {
      campaign: {
        select: { facebookPageId: true, facebookPageToken: true },
      },
    },
  });
  if (!post) return NOTHING;
  if (post.providerPostId || post.status === "PUBLISHED") return NOTHING;

  const result = await publishToPage(
    { id: post.campaign.facebookPageId, token: post.campaign.facebookPageToken },
    { body: post.body, linkUrl: post.linkUrl, imageUrl: post.imageUrl },
  );

  if (!result.ok) {
    await db.socialPost.update({
      where: { id: postId },
      data: { status: "FAILED", errorMessage: result.error },
    });
    return { published: 0, failed: 1, dryRun: false, errors: [result.error] };
  }

  await db.socialPost.update({
    where: { id: postId },
    data: {
      status: "PUBLISHED",
      providerPostId: result.postId,
      dryRun: result.dryRun,
      publishedAt: new Date(),
      errorMessage: "",
    },
  });

  return { published: 1, failed: 0, dryRun: result.dryRun, errors: [] };
}

export async function publishPost(postId: string): Promise<PublishOutcome> {
  if (!(await requireOwned("socialPost", postId, "MANAGER"))) {
    return { ...NOTHING, errors: ["You do not have permission to post for this campaign"] };
  }

  const outcome = await publishOne(postId);
  refresh(postId);
  return outcome;
}

/**
 * Everything approved whose time has come.
 *
 * There is no cron in this app, so the page calls this when it is open — the
 * same shape as the texting send runner. A candidate who never opens the app
 * on a Tuesday gets their Tuesday post late, which is the honest trade for not
 * running a scheduler.
 */
export async function publishDue(limit = 5): Promise<PublishOutcome> {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) {
    return { ...NOTHING, errors: ["Manager access required"] };
  }

  const due = await db.socialPost.findMany({
    where: {
      campaignId,
      status: "APPROVED",
      providerPostId: "",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: Math.max(1, Math.min(25, limit)),
    select: { id: true },
  });

  const total: PublishOutcome = { published: 0, failed: 0, dryRun: false, errors: [] };
  for (const post of due) {
    const one = await publishOne(post.id);
    total.published += one.published;
    total.failed += one.failed;
    total.dryRun = total.dryRun || one.dryRun;
    total.errors.push(...one.errors);
  }

  refresh();
  return total;
}

/* --------------------------------------------------------------- the account */

/**
 * Finish a connection where the candidate had more than one Page to choose
 * from. The handoff cookie carries the user token; the Page tokens are fetched
 * again here rather than being carried through the browser.
 */
export async function connectPage(formData: FormData) {
  const jar = await cookies();
  const claim = readSignedValue(jar.get(FACEBOOK_HANDOFF_COOKIE)?.value);
  if (!claim) return;

  const separator = claim.indexOf(":");
  const campaignId = claim.slice(0, separator);
  const userToken = claim.slice(separator + 1);
  if (!campaignId || !userToken) return;

  if (!(await requireCampaign(campaignId, "MANAGER"))) return;

  const chosen = str(formData, "pageId");
  const pages = await listPages(userToken);
  if (!pages.ok) return;

  const page = pages.pages.find((candidate) => candidate.id === chosen);
  if (!page) return;

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      facebookPageId: page.id,
      facebookPageName: page.name,
      facebookPageToken: page.accessToken,
    },
  });

  jar.delete(FACEBOOK_HANDOFF_COOKIE);
  refresh();
  redirect("/social?connect=ok");
}

/** Forget the Page. The token is Facebook's to revoke; this drops our copy. */
export async function disconnectPage() {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      facebookPageId: "",
      facebookPageName: "",
      facebookPageToken: "",
      facebookTokenExpiresAt: null,
    },
  });

  refresh();
}
