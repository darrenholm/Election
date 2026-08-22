"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { str } from "@/lib/form";

/**
 * Slate membership and sharing.
 *
 * Forming a slate is an administrator's job — it decides who can read whose
 * canvass — but the decision to actually share is the candidate's, so the
 * toggle is available to the campaign's owner or manager too.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) throw new Error("Administrators only");
  return user;
}

export async function createSlate(formData: FormData) {
  await requireAdmin();

  const name = str(formData, "name");
  const municipalityId = str(formData, "municipalityId");
  if (!name || !municipalityId) return;

  await db.slate.create({ data: { name, municipalityId } });
  revalidatePath("/campaigns");
}

export async function addToSlate(formData: FormData) {
  await requireAdmin();

  const slateId = str(formData, "slateId");
  const campaignId = str(formData, "campaignId");
  if (!slateId || !campaignId) return;

  // A slate only makes sense within one municipality — candidates in different
  // towns knock different doors, so there is nothing to pool.
  const [slate, campaign] = await Promise.all([
    db.slate.findUnique({ where: { id: slateId } }),
    db.campaign.findUnique({ where: { id: campaignId } }),
  ]);
  if (!slate || !campaign) return;
  if (slate.municipalityId !== campaign.municipalityId) return;

  await db.slateMembership.upsert({
    where: { slateId_campaignId: { slateId, campaignId } },
    create: { slateId, campaignId },
    update: {},
  });

  revalidatePath("/campaigns");
}

export async function removeFromSlate(membershipId: string) {
  await requireAdmin();
  await db.slateMembership.delete({ where: { id: membershipId } });
  revalidatePath("/campaigns");
  revalidatePath("/", "layout");
}

/**
 * Turn canvass sharing on or off for one campaign. Sharing is reciprocal, so
 * switching it off also stops this campaign seeing its slate-mates' notes.
 */
export async function setSlateSharing(membershipId: string, shares: boolean) {
  const membership = await db.slateMembership.findUnique({
    where: { id: membershipId },
    select: { campaignId: true },
  });
  if (!membership) return;

  const user = await getCurrentUser();
  const allowed =
    user?.isAdmin === true || (await hasRole(membership.campaignId, "MANAGER"));
  if (!allowed) throw new Error("Not allowed to change sharing for this campaign");

  await db.slateMembership.update({
    where: { id: membershipId },
    data: { sharesCanvassData: shares },
  });

  revalidatePath("/campaigns");
  revalidatePath("/voters");
  revalidatePath("/canvass");
}

export async function deleteSlate(slateId: string) {
  await requireAdmin();
  await db.slate.delete({ where: { id: slateId } });
  revalidatePath("/campaigns");
}
