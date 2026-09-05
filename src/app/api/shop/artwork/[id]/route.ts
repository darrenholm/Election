import { db } from "@/lib/db";
import { getCurrentCustomer, isShopStaff } from "@/lib/shop/auth";
import { readArtworkToken } from "@/lib/shop/artwork-links";

export const dynamic = "force-dynamic";

/**
 * Serves one artwork file.
 *
 * Three kinds of caller are allowed and no others: the customer whose order it
 * belongs to, the shop, and a holder of a signed link for this one file — which
 * is how a trade printer fetches the artwork of a job we have sent them, having
 * no session of any kind. A candidate's unreleased sign design is exactly the
 * sort of thing a rival campaign would like to see a fortnight before voting
 * day, so a wrong caller is told the file does not exist rather than that it
 * exists and is not theirs.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // The token names one file and is signed, so it cannot be edited into naming
  // another; it is checked before the session because a printer's fetcher has
  // no cookies and there is no point looking one up.
  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  if (readArtworkToken(token) === id) return serve(artwork);

  const customer = await getCurrentCustomer();
  const allowed = customer?.id === artwork.order.customerId || (await isShopStaff());
  if (!allowed) return new Response("Not found", { status: 404 });

  return serve(artwork);
}

function serve(artwork: { bytes: Uint8Array; mimeType: string; filename: string }) {

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
