import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Downscaled on the phone before it is sent; this is the ceiling, not the target. */
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Where the sign crew's phone posts a photograph of a sign in place.
 *
 * A route handler rather than a server action for the same reason canvass
 * photos are one: the phone has to be able to see a failure and hold on to the
 * image. See src/app/api/photos/route.ts, which this deliberately mirrors.
 *
 * Idempotent on clientId, so a retry after a lost response is recognised rather
 * than stored a second time.
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
  const signRequestId = String(form.get("signRequestId") ?? "").trim();
  const file = form.get("photo");

  if (clientId === "" || signRequestId === "" || !(file instanceof File)) {
    return Response.json(
      { error: "clientId, signRequestId and photo are all required" },
      { status: 400 },
    );
  }
  if (file.size === 0) return Response.json({ error: "The photo is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That photo is too large" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "That is not an image" }, { status: 400 });
  }

  const existing = await db.signPhoto.findUnique({
    where: { clientId },
    select: { id: true },
  });
  if (existing) {
    // Already have it. The queue treats a 409 as success and stops retrying.
    return Response.json({ id: existing.id, duplicate: true }, { status: 409 });
  }

  // The sign id comes off a phone and is not trusted: it must belong to the
  // campaign this user is actually working on, or a crafted request could hang
  // a photograph on a rival's sign.
  const sign = await db.signRequest.findFirst({
    where: { id: signRequestId, campaignId: campaign.id },
    select: { id: true },
  });
  if (!sign) return Response.json({ error: "Unknown sign" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const asFloat = (key: string): number | null => {
    const raw = String(form.get(key) ?? "").trim();
    if (raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const photo = await db.signPhoto.create({
    data: {
      campaignId: campaign.id,
      signRequestId: sign.id,
      clientId,
      mimeType: file.type,
      bytes,
      byteSize: bytes.byteLength,
      width: Number(form.get("width") ?? 0) || 0,
      height: Number(form.get("height") ?? 0) || 0,
      latitude: asFloat("latitude"),
      longitude: asFloat("longitude"),
      caption: String(form.get("caption") ?? "").slice(0, 500),
    },
    select: { id: true },
  });

  return Response.json({ id: photo.id }, { status: 201 });
}
