import { db } from "@/lib/db";
import { canAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serves one sign photograph.
 *
 * Less sensitive than a canvassing photo — a sign on a public road is a public
 * thing — but it still maps a campaign's whole sign deployment, which is not
 * something to hand to a rival by URL. Same access rule as everything else:
 * readable only by someone on the campaign that took it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const photo = await db.signPhoto.findUnique({
    where: { id },
    select: { bytes: true, mimeType: true, campaignId: true },
  });
  if (!photo) return new Response("Not found", { status: 404 });
  if (!(await canAccess(photo.campaignId))) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
}
