"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { requireCampaignId } from "@/lib/campaign";

/**
 * Close off a follow-up.
 *
 * Kept as a timestamp rather than a deletion: what was promised at a door and
 * whether anyone went back is exactly the sort of thing a candidate wants to be
 * able to look at after the fact.
 */
export async function resolveFollowUp(contactId: string, done: boolean) {
  const campaignId = await requireCampaignId();
  if (!(await hasRole(campaignId, "CANVASSER"))) return;

  // Scoped to the active campaign: a contact id from elsewhere must not be
  // reachable by guessing.
  const contact = await db.contactAttempt.findFirst({
    where: { id: contactId, campaignId },
    select: { id: true },
  });
  if (!contact) return;

  await db.contactAttempt.update({
    where: { id: contact.id },
    data: { followUpDoneAt: done ? new Date() : null },
  });

  revalidatePath("/canvass/follow-ups");
  revalidatePath("/canvass");
}
