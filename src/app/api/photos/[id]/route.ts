import { db } from "@/lib/db";
import { canAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serves one canvassing photo.
 *
 * Photos are of members of the public standing on their own doorstep, so they
 * are readable only by someone with access to the campaign that took them —
 * never by URL alone. That is the whole reason these are in the database rather
 * than in a public bucket.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const photo = await db.canvassPhoto.findUnique({
    where: { id },
    select: { bytes: true, mimeType: true, campaignId: true },
  });
  if (!photo) return new Response("Not found", { status: 404 });
  if (!(await canAccess(photo.campaignId))) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      // Private: a shared cache must never hold one of these.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
}
