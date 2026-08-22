import { getMapPayload } from "@/lib/map-data";

export const dynamic = "force-dynamic";

/**
 * Lets the map refresh itself after a geocoding batch without a full page
 * reload, and keeps a few thousand points out of the RSC stream.
 */
export async function GET() {
  const payload = await getMapPayload();
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
