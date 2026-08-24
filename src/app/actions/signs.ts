"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { SIGN_PLACEMENTS, SIGN_STATUSES, SIGN_TYPES } from "@/lib/enums";
import { bool, date, floatOrNull, int, oneOf, str, strOrNull } from "@/lib/form";
import { getActiveCampaign, requireCampaignId } from "@/lib/campaign";
import { requireCampaign, requireOwned } from "@/lib/guard";
import { removalDueAt } from "@/lib/sign-placement";

function refreshSigns() {
  revalidatePath("/signs");
  revalidatePath("/signs/run-sheet");
  revalidatePath("/signs/roadside");
  revalidatePath("/");
}

/**
 * The campaign's voting day, for stamping removal deadlines. Read once per
 * action rather than threaded through every caller — the deadline is a property
 * of the election, not of anything the form can tell us.
 */
async function votingDayOf(campaignId: string): Promise<Date | null> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { votingDay: true },
  });
  return campaign?.votingDay ?? null;
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
      placement: oneOf(formData, "placement", SIGN_PLACEMENTS, "PRIVATE_LAWN"),
      landmark: str(formData, "landmark"),
      signNumber: str(formData, "signNumber"),
      permissionFrom: str(formData, "permissionFrom"),
      permissionPhone: str(formData, "permissionPhone"),
      notes: str(formData, "notes"),
    },
  });
  refreshSigns();
}

/**
 * A sign put in the ground on a roadside, recorded where it stands.
 *
 * Distinct from createSignRequest because the two start from opposite ends. A
 * lawn sign begins as a request from somebody who wants one and is installed
 * later; a roadside sign begins as a crew stopping the truck at a corner, and
 * by the time anyone types anything it is already up. So this one is INSTALLED
 * from the outset, carries coordinates rather than an address, and stamps its
 * removal deadline immediately — that deadline is the whole reason the record
 * exists.
 */
export async function createRoadsideSign(formData: FormData) {
  const campaignId = await requireCampaignId();
  const placement = oneOf(formData, "placement", SIGN_PLACEMENTS, "MUNICIPAL_ROW");
  const votingDay = await votingDayOf(campaignId);

  const latitude = floatOrNull(formData, "latitude");
  const longitude = floatOrNull(formData, "longitude");
  const installedAt = date(formData, "installedAt") ?? new Date();

  const sign = await db.signRequest.create({
    data: {
      campaignId,
      signType: oneOf(formData, "signType", SIGN_TYPES, "BIG_4X8"),
      quantity: Math.max(1, int(formData, "quantity", 1)),
      status: "INSTALLED",
      placement,
      landmark: str(formData, "landmark"),
      signNumber: str(formData, "signNumber"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      ward: str(formData, "ward"),
      latitude,
      longitude,
      // The crew stood at the spot, so the position is as good as geocoding
      // gets. Marking it OK keeps the map from queueing it for a lookup that
      // could only make it worse.
      geocodeStatus: latitude != null && longitude != null ? "OK" : "PENDING",
      geocodePrecision: latitude != null && longitude != null ? "GPS" : "",
      geocodedAt: latitude != null && longitude != null ? new Date() : null,
      permissionConfirmed: bool(formData, "permissionConfirmed"),
      permissionFrom: str(formData, "permissionFrom"),
      permissionPhone: str(formData, "permissionPhone"),
      installedAt,
      installedById: strOrNull(formData, "installedById"),
      removalDueAt: votingDay ? removalDueAt(votingDay, placement) : null,
      notes: str(formData, "notes"),
    },
    select: { id: true },
  });

  refreshSigns();
  return sign.id;
}

/**
 * Move a sign through its lifecycle. The status stamps its own date so the
 * board can answer "how long has this been waiting" without a separate log.
 */
export async function setSignStatus(signId: string, formData: FormData) {
  const campaignId = await requireOwned("signRequest", signId);
  if (!campaignId) return;

  const status = oneOf(formData, "status", SIGN_STATUSES, "REQUESTED");
  const now = new Date();

  // Going up is the moment the clock starts, so the deadline is worked out from
  // the sign's placement here rather than left for a nightly job to notice.
  let due: Date | null | undefined = undefined;
  if (status === "INSTALLED") {
    const [sign, votingDay] = await Promise.all([
      db.signRequest.findUnique({ where: { id: signId }, select: { placement: true } }),
      votingDayOf(campaignId),
    ]);
    due = sign && votingDay
      ? removalDueAt(votingDay, sign.placement as keyof typeof SIGN_PLACEMENTS)
      : null;
  }

  await db.signRequest.update({
    where: { id: signId },
    data: {
      status,
      installedAt: status === "INSTALLED" ? now : undefined,
      removedAt: status === "REMOVED" ? now : undefined,
      installedById:
        status === "INSTALLED" ? strOrNull(formData, "installedById") : undefined,
      removedById: status === "REMOVED" ? strOrNull(formData, "removedById") : undefined,
      removalDueAt: due,
      scheduledFor: status === "SCHEDULED" ? date(formData, "scheduledFor") : undefined,
    },
  });

  refreshSigns();
}

/**
 * Tick off a batch of signs as collected.
 *
 * The retrieval crew works a route and comes back with an armful, and making
 * them open each sign in turn is how a sheet gets marked "done" in the truck
 * and never in the app. Ids are filtered through the ownership check
 * individually — the list arrives from a form and is not to be trusted.
 */
export async function markSignsRemoved(formData: FormData) {
  const ids = formData.getAll("signId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return;

  const removedById = strOrNull(formData, "removedById");
  const now = new Date();

  const owned: string[] = [];
  for (const id of ids) {
    if (await requireOwned("signRequest", id)) owned.push(id);
  }
  if (owned.length === 0) return;

  await db.signRequest.updateMany({
    where: { id: { in: owned } },
    data: { status: "REMOVED", removedAt: now, removedById },
  });

  refreshSigns();
}

/**
 * Re-stamp every outstanding deadline against the campaign's voting day.
 *
 * Needed when the voting day is corrected in Settings, or when a by-law turns
 * out to allow more or less time than the defaults assume — otherwise a run
 * sheet keeps quoting a date that no longer applies.
 */
export async function recalculateRemovalDeadlines() {
  const campaign = await getActiveCampaign();
  if (!campaign) return;
  // Re-dating every sign on the campaign at once is a manager's job, not a
  // canvasser's.
  if (!(await requireCampaign(campaign.id, "MANAGER"))) return;

  const signs = await db.signRequest.findMany({
    where: { campaignId: campaign.id, status: { notIn: ["REMOVED", "DECLINED"] } },
    select: { id: true, placement: true },
  });

  for (const sign of signs) {
    await db.signRequest.update({
      where: { id: sign.id },
      data: {
        removalDueAt: removalDueAt(
          campaign.votingDay,
          sign.placement as keyof typeof SIGN_PLACEMENTS,
        ),
      },
    });
  }

  refreshSigns();
}

export async function updateSignRequest(signId: string, formData: FormData) {
  const campaignId = await requireOwned("signRequest", signId);
  if (!campaignId) return;

  const placement = oneOf(formData, "placement", SIGN_PLACEMENTS, "PRIVATE_LAWN");

  // Moving a sign from a lawn to a road allowance shortens its deadline, so the
  // due date is recomputed whenever the placement is edited rather than left at
  // whatever the install stamped.
  const [existing, votingDay] = await Promise.all([
    db.signRequest.findUnique({
      where: { id: signId },
      select: { placement: true, removalDueAt: true },
    }),
    votingDayOf(campaignId),
  ]);
  const placementChanged = existing != null && existing.placement !== placement;
  const due = votingDay && (placementChanged || existing?.removalDueAt != null)
    ? removalDueAt(votingDay, placement)
    : undefined;

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
      placement,
      landmark: str(formData, "landmark"),
      signNumber: str(formData, "signNumber"),
      permissionFrom: str(formData, "permissionFrom"),
      permissionPhone: str(formData, "permissionPhone"),
      removalDueAt: due,
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
