"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { CAMPAIGN_ID } from "@/lib/campaign";
import { OFFICES } from "@/lib/enums";
import { centsOrNull, date, int, oneOf, str } from "@/lib/form";

export async function saveCampaign(formData: FormData) {
  const votingDay = date(formData, "votingDay") ?? new Date();
  const data = {
    candidateName: str(formData, "candidateName"),
    office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
    municipality: str(formData, "municipality"),
    ward: str(formData, "ward"),
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
  };

  await db.campaign.upsert({
    where: { id: CAMPAIGN_ID },
    create: { id: CAMPAIGN_ID, ...data },
    update: data,
  });

  // Limits and the campaign name appear in the shell and on every finance page.
  revalidatePath("/", "layout");
}
