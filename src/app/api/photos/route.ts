import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Downscaled on the phone to about 200 KB; this is the ceiling, not the target. */
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Where a canvasser's phone posts a photo taken at a door.
 *
 * An API route rather than a server action for the same reason contacts are:
 * the phone has to be able to catch a failure and hold the photo locally. See
 * src/lib/photo.ts.
 *
 * Idempotent on clientId — the offline queue retries freely, and a photo whose
 * response was lost on the way back is recognised rather than stored twice.
 */
export async function POST(request: Request) {
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "No campaign selected" }, { status: 409 });
  if (!(await hasRole(campaign.id, "CANVASSER"))) {
    return Response.json({ error: "Not allowed on this campaign" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Expected a form upload" }, { status: 400 });

  const clientId = String(form.get("clientId") ?? "").trim();
  const file = form.get("photo");
  if (clientId === "" || !(file instanceof File)) {
    return Response.json({ error: "clientId and photo are both required" }, { status: 400 });
  }
  if (file.size === 0) return Response.json({ error: "The photo is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That photo is too large" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "That is not an image" }, { status: 400 });
  }

  const existing = await db.canvassPhoto.findUnique({
    where: { clientId },
    select: { id: true, campaignId: true },
  });
  if (existing) {
    // Already have it. Say so plainly rather than storing a second copy; the
    // queue treats this as success and stops retrying.
    return Response.json({ id: existing.id, duplicate: true }, { status: 409 });
  }

  // A voter id from the phone is not trusted: it must belong to this campaign's
  // municipality, or a crafted request could attach a photo to somebody in
  // another town entirely.
  const requestedVoterId = String(form.get("voterId") ?? "").trim();
  let voterId: string | null = null;
  if (requestedVoterId !== "") {
    const voter = await db.voter.findFirst({
      where: { id: requestedVoterId, municipalityId: campaign.municipalityId },
      select: { id: true },
    });
    if (!voter) return Response.json({ error: "Unknown voter" }, { status: 400 });
    voterId = voter.id;
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The door and the photo are queued separately and either can land first, so
  // the join is made from whichever arrives second. Both carry the clientId the
  // phone generated, which is what ties them together.
  const contact = await db.contactAttempt.findFirst({
    where: { clientId, campaignId: campaign.id },
    select: { id: true },
  });

  const photo = await db.canvassPhoto.create({
    data: {
      campaignId: campaign.id,
      voterId,
      contactAttemptId: contact?.id ?? null,
      clientId,
      mimeType: file.type,
      bytes,
      byteSize: bytes.byteLength,
      width: Number(form.get("width") ?? 0) || 0,
      height: Number(form.get("height") ?? 0) || 0,
      mayPublish: form.get("mayPublish") === "1",
      permissionWording: String(form.get("permissionWording") ?? "").slice(0, 1000),
      caption: String(form.get("caption") ?? "").slice(0, 500),
    },
    select: { id: true },
  });

  return Response.json({ id: photo.id }, { status: 201 });
}
