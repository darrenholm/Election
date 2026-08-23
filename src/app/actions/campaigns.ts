"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireCampaign } from "@/lib/guard";
import { ACTIVE_CAMPAIGN_COOKIE, nextOntarioVotingDay, slugify } from "@/lib/campaign";
import { OFFICES } from "@/lib/enums";
import { bool, centsOrNull, date, int, oneOf, str, strOrNull } from "@/lib/form";

export type CampaignSaveResult = { error: string } | null;

/** Switch which campaign the app is working on. */
export async function setActiveCampaign(campaignId: string) {
  // findActiveCampaign() re-checks this cookie on every read, so an unreachable
  // id could not leak anything — but it would silently land the user on some
  // other campaign, which looks like a bug rather than a refusal.
  if (!(await requireCampaign(campaignId, "VIEWER"))) return;

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const jar = await cookies();
  jar.set(ACTIVE_CAMPAIGN_COOKIE, campaignId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Every page shows campaign-scoped data, so the whole tree is stale.
  revalidatePath("/", "layout");
  redirect("/");
}

/** Create or find a municipality by name — several campaigns share one. */
async function resolveMunicipality(name: string, usesWards: boolean): Promise<string> {
  const trimmed = name.trim() || "Unnamed municipality";
  const existing = await db.municipality.findUnique({ where: { name: trimmed } });
  if (existing) return existing.id;

  const created = await db.municipality.create({
    data: { name: trimmed, usesWards },
  });
  return created.id;
}

export async function createCampaign(_prev: CampaignSaveResult, formData: FormData): Promise<CampaignSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const candidateName = str(formData, "candidateName");
  if (candidateName === "") return { error: "Enter the candidate's name." };

  // A blank name used to become "Unnamed municipality", which is not something
  // anyone meant to create and is confusing to find later.
  if (!strOrNull(formData, "municipalityId") && str(formData, "municipalityName") === "") {
    return {
      error: "Name the municipality, or pick an existing one to share its doors and electors.",
    };
  }

  const office = oneOf(formData, "office", OFFICES, "COUNCILLOR");
  const municipalityId =
    strOrNull(formData, "municipalityId") ??
    (await resolveMunicipality(str(formData, "municipalityName"), bool(formData, "usesWards")));

  const votingDay = date(formData, "votingDay") ?? nextOntarioVotingDay();

  // Slugs have to be unique; a town with two Smiths running would otherwise
  // collide, so disambiguate with a counter rather than failing the create.
  const base = slugify(`${candidateName}-${office}`) || "campaign";
  let slug = base;
  for (let n = 2; await db.campaign.findUnique({ where: { slug } }); n++) {
    slug = `${base}-${n}`;
  }

  const campaign = await db.campaign.create({
    data: {
      slug,
      candidateName,
      office,
      municipalityId,
      ward: str(formData, "ward"),
      votingDay,
      campaignPeriodStart:
        date(formData, "campaignPeriodStart") ?? new Date(votingDay.getFullYear(), 0, 2),
      electorCount: Math.max(0, int(formData, "electorCount")),
    },
  });

  // Without this the campaign is invisible to the person who just made it:
  // access is granted per campaign, and an administrator is the only one who
  // reaches anything without a row here.
  if (!user.isAdmin) {
    await db.campaignAccess.create({
      data: { userId: user.id, campaignId: campaign.id, role: "OWNER" },
    });
  }

  const jar = await cookies();
  jar.set(ACTIVE_CAMPAIGN_COOKIE, campaign.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function updateCampaign(
  campaignId: string,
  _prev: CampaignSaveResult,
  formData: FormData,
): Promise<CampaignSaveResult> {
  // The settings form carries the spending limits and the campaign's Twilio
  // sending number, so this is not a page a canvasser may post to — and the id
  // arrives from the client, so the check has to be against that id rather than
  // against whichever campaign happens to be active.
  if (!(await requireCampaign(campaignId, "MANAGER"))) {
    return { error: "You do not have permission to change this campaign." };
  }

  const user = await getCurrentUser();
  const votingDay = date(formData, "votingDay") ?? new Date();
  const usesWards = bool(formData, "usesWards");

  const current = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { municipalityId: true },
  });
  if (!current) return { error: "That campaign no longer exists." };

  /* ---------------------------------------------------- move, if asked ---- */

  // Which municipality the candidate is running in. Changing it moves the
  // campaign; it does not rename anything.
  let municipalityId = current.municipalityId;
  const chosen = str(formData, "municipalityChoice");

  const wantsMove = chosen === "__new__" || (chosen !== "" && chosen !== current.municipalityId);
  if (wantsMove && !user?.isAdmin) {
    return { error: "Only an administrator can move a campaign to another municipality." };
  }

  if (chosen === "__new__") {
    const name = str(formData, "newMunicipalityName");
    if (name === "") return { error: "Name the new municipality." };
    const clash = await db.municipality.findUnique({ where: { name } });
    if (clash) {
      municipalityId = clash.id;
    } else {
      const created = await db.municipality.create({ data: { name, usesWards } });
      municipalityId = created.id;
    }
  } else if (chosen && chosen !== current.municipalityId) {
    municipalityId = chosen;
  }

  if (municipalityId !== current.municipalityId) {
    // Everything this campaign has learned points at the old municipality's
    // doors and electors. Moving it would leave that data describing people in
    // a town the candidate is no longer running in, so refuse rather than
    // quietly strand it.
    const [contacts, states, turfs] = await Promise.all([
      db.contactAttempt.count({ where: { campaignId } }),
      db.voterCampaignState.count({ where: { campaignId } }),
      db.turf.count({ where: { campaignId } }),
    ]);

    if (contacts + states + turfs > 0) {
      return {
        error:
          `This campaign already has canvassing data for its current municipality — ${contacts} contacts, ${states} identified voters, ${turfs} turf. ` +
          "Moving it would leave that describing the wrong town. Create a fresh campaign in the right municipality instead.",
      };
    }
  }

  /* ------------------------------------------------------------- rename --- */

  // Renaming is a separate act from moving: it changes the town's name for
  // every campaign running there.
  const rename = str(formData, "renameMunicipality");
  if (rename) {
    const target = await db.municipality.findUnique({ where: { id: municipalityId } });
    if (target && rename !== target.name) {
      // A town's name is shared by every campaign running there, so one
      // candidate cannot rename it out from under the others.
      if (!user?.isAdmin) {
        return { error: "Only an administrator can rename a municipality." };
      }
      const clash = await db.municipality.findUnique({ where: { name: rename } });
      if (clash) {
        return {
          error: `A municipality named "${rename}" already exists. To put this candidate there, choose it from the Municipality list instead of renaming this one.`,
        };
      }
      await db.municipality.update({ where: { id: municipalityId }, data: { name: rename } });
    }
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      candidateName: str(formData, "candidateName"),
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
      municipalityId,
      // Clear any stored ward when wards are switched off, so a value entered
      // earlier cannot resurface if they are switched back on later.
      ward: usesWards ? str(formData, "ward") : "",
      votingDay,
      campaignPeriodStart:
        date(formData, "campaignPeriodStart") ?? new Date(votingDay.getFullYear(), 0, 2),
      campaignPeriodEnd: date(formData, "campaignPeriodEnd"),
      electorCount: Math.max(0, int(formData, "electorCount")),
      certifiedSpendingLimitCents: centsOrNull(formData, "certifiedSpendingLimit"),
      certifiedPartyExpenseLimitCents: centsOrNull(formData, "certifiedPartyExpenseLimit"),
      certifiedSelfFundingLimitCents: centsOrNull(formData, "certifiedSelfFundingLimit"),
      contactEmail: str(formData, "contactEmail"),
      contactPhone: str(formData, "contactPhone"),
      twilioFromNumber: str(formData, "twilioFromNumber"),
      twilioMessagingServiceSid: str(formData, "twilioMessagingServiceSid"),
    },
  });

  // Wards are a fact about the town, shared by every campaign there.
  await db.municipality.update({
    where: { id: municipalityId },
    data: { usesWards },
  });

  revalidatePath("/", "layout");
  return null;
}

export async function archiveCampaign(campaignId: string, archived: boolean) {
  if (!(await requireCampaign(campaignId, "OWNER"))) return;

  await db.campaign.update({
    where: { id: campaignId },
    data: { isActive: !archived },
  });
  revalidatePath("/", "layout");
}

/**
 * Delete a campaign and everything it owns. The municipality's doors and
 * electors are untouched — they belong to the town, not the candidate, and
 * other campaigns are still using them.
 */
export async function deleteCampaign(
  campaignId: string,
  _prev: CampaignSaveResult,
  formData: FormData,
): Promise<CampaignSaveResult> {
  // MANAGER is "everything except deleting the campaign", so this one is the
  // candidate's own call.
  if (!(await requireCampaign(campaignId, "OWNER"))) {
    return { error: "Only the candidate or an administrator can delete a campaign." };
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { candidateName: true },
  });
  // Already gone, most likely from another tab. Nothing to say about it.
  if (!campaign) return null;

  // The typed name is checked here rather than in the browser. This is the one
  // action in the app with nothing behind it — no archive, no undo — so the
  // confirmation has to be part of the action itself and not a dialog that a
  // posted form can skip.
  const typed = str(formData, "confirmName").trim();
  if (typed.toLowerCase() !== campaign.candidateName.trim().toLowerCase()) {
    return { error: `Type ${campaign.candidateName} exactly as it appears to confirm.` };
  }

  await db.campaign.delete({ where: { id: campaignId } });

  const jar = await cookies();
  if (jar.get(ACTIVE_CAMPAIGN_COOKIE)?.value === campaignId) {
    jar.delete(ACTIVE_CAMPAIGN_COOKIE);
  }

  revalidatePath("/", "layout");
  redirect("/campaigns");
}
