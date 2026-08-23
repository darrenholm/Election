"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { SIGN_STATUSES, SIGN_TYPES } from "@/lib/enums";
import { bool, date, int, oneOf, str, strOrNull } from "@/lib/form";
import { requireCampaignId } from "@/lib/campaign";
import { requireOwned } from "@/lib/guard";

function refreshSigns() {
  revalidatePath("/signs");
  revalidatePath("/signs/run-sheet");
  revalidatePath("/");
}

export async function createSignRequest(formData: FormData) {
  const campaignId = await requireCampaignId();
  await db.signRequest.create({
    data: {
      campaignId,
      voterId: strOrNull(formData, "voterId"),
      requesterName: str(formData, "requesterName"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      postalCode: str(formData, "postalCode"),
      ward: str(formData, "ward"),
      signType: oneOf(formData, "signType", SIGN_TYPES, "SMALL_LAWN"),
      quantity: Math.max(1, int(formData, "quantity", 1)),
      status: oneOf(formData, "status", SIGN_STATUSES, "REQUESTED"),
      permissionConfirmed: bool(formData, "permissionConfirmed"),
      notes: str(formData, "notes"),
    },
  });
  refreshSigns();
}

/**
 * Move a sign through its lifecycle. The status stamps its own date so the
 * board can answer "how long has this been waiting" without a separate log.
 */
export async function setSignStatus(signId: string, formData: FormData) {
  if (!(await requireOwned("signRequest", signId))) return;

  const status = oneOf(formData, "status", SIGN_STATUSES, "REQUESTED");
  const now = new Date();

  await db.signRequest.update({
    where: { id: signId },
    data: {
      status,
      installedAt: status === "INSTALLED" ? now : undefined,
      removedAt: status === "REMOVED" ? now : undefined,
      installedById:
        status === "INSTALLED" ? strOrNull(formData, "installedById") : undefined,
      scheduledFor: status === "SCHEDULED" ? date(formData, "scheduledFor") : undefined,
    },
  });

  refreshSigns();
}

export async function updateSignRequest(signId: string, formData: FormData) {
  if (!(await requireOwned("signRequest", signId))) return;

  await db.signRequest.update({
    where: { id: signId },
    data: {
      requesterName: str(formData, "requesterName"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      postalCode: str(formData, "postalCode"),
      ward: str(formData, "ward"),
      signType: oneOf(formData, "signType", SIGN_TYPES, "SMALL_LAWN"),
      quantity: Math.max(1, int(formData, "quantity", 1)),
      permissionConfirmed: bool(formData, "permissionConfirmed"),
      scheduledFor: date(formData, "scheduledFor"),
      notes: str(formData, "notes"),
    },
  });
  refreshSigns();
}

export async function deleteSignRequest(signId: string) {
  if (!(await requireOwned("signRequest", signId))) return;

  await db.signRequest.delete({ where: { id: signId } });
  refreshSigns();
}

/** How many of each sign type the campaign owns, for the "left in the garage" figure. */
export async function setInventory(formData: FormData) {
  const campaignId = await requireCampaignId();
  for (const signType of Object.keys(SIGN_TYPES)) {
    const raw = formData.get(`quantity_${signType}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const quantityOwned = Math.max(0, Math.round(Number(raw)) || 0);

    await db.signInventory.upsert({
      where: { campaignId_signType: { campaignId, signType } },
      create: { campaignId, signType, quantityOwned },
      update: { quantityOwned },
    });
  }
  refreshSigns();
}
