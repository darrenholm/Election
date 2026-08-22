"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ACTIVE_CAMPAIGN_COOKIE, nextOntarioVotingDay, slugify } from "@/lib/campaign";
import { OFFICES } from "@/lib/enums";
import { bool, centsOrNull, date, int, oneOf, str, strOrNull } from "@/lib/form";

/** Switch which campaign the app is working on. */
export async function setActiveCampaign(campaignId: string) {
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

export async function createCampaign(formData: FormData) {
  const candidateName = str(formData, "candidateName");
  if (candidateName === "") return;

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

export async function updateCampaign(campaignId: string, formData: FormData) {
  const votingDay = date(formData, "votingDay") ?? new Date();
  const usesWards = bool(formData, "usesWards");

  const campaign = await db.campaign.update({
    where: { id: campaignId },
    data: {
      candidateName: str(formData, "candidateName"),
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
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

  // Wards are a fact about the municipality, shared by every campaign there.
  await db.municipality.update({
    where: { id: campaign.municipalityId },
    data: { usesWards },
  });

  revalidatePath("/", "layout");
}

export async function archiveCampaign(campaignId: string, archived: boolean) {
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
export async function deleteCampaign(campaignId: string) {
  await db.campaign.delete({ where: { id: campaignId } });

  const jar = await cookies();
  if (jar.get(ACTIVE_CAMPAIGN_COOKIE)?.value === campaignId) {
    jar.delete(ACTIVE_CAMPAIGN_COOKIE);
  }

  revalidatePath("/", "layout");
  redirect("/campaigns");
}
