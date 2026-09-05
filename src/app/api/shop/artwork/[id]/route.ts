import { db } from "@/lib/db";
import { getCurrentCustomer, isShopStaff } from "@/lib/shop/auth";

export const dynamic = "force-dynamic";

/**
 * Serves one artwork file.
 *
 * Two kinds of caller are allowed and no others: the customer whose order it
 * belongs to, and the shop. A candidate's unreleased sign design is exactly the
 * sort of thing a rival campaign would like to see a fortnight before voting
 * day, so a wrong caller is told the file does not exist rather than that it
 * exists and is not theirs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const artwork = await db.shopArtwork.findUnique({
    where: { id },
    select: {
      bytes: true,
      mimeType: true,
      filename: true,
      order: { select: { customerId: true } },
    },
  });
  if (!artwork) return new Response("Not found", { status: 404 });

  const customer = await getCurrentCustomer();
  const allowed = customer?.id === artwork.order.customerId || (await isShopStaff());
  if (!allowed) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(artwork.bytes), {
    headers: {
      "Content-Type": artwork.mimeType,
      "Cache-Control": "private, max-age=3600",
      // Named rather than inline: these are print files, and the browser
      // guessing at how to display an EPS helps nobody.
      "Content-Disposition": `attachment; filename="${artwork.filename.replace(/["\\]/g, "")}"`,
    },
  });
}
