import { NextResponse } from "next/server";
import {
  HANDOFF_COOKIE,
  HANDOFF_COOKIE_OPTIONS,
  portalBase,
  readCampaignHandoff,
} from "@/lib/shop/handoff";

export const dynamic = "force-dynamic";

/**
 * Where a link from the campaign manager lands.
 *
 * Takes the signed token out of the URL, keeps it in a cookie so it survives
 * the walk from the catalogue to the registration form, and sends the visitor
 * on to the shop. A bad or expired token is not an error worth showing anybody
 * — they simply arrive at the storefront with nothing filled in, which is where
 * they were going anyway.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaignId = readCampaignHandoff(url.searchParams.get("token") ?? undefined);

  // Only ever within this site, so a crafted link cannot bounce somebody off to
  // somewhere else wearing our domain.
  const next = url.searchParams.get("next");
  const destination =
    next && next.startsWith("/election") && !next.startsWith("//") ? next : "/election/register";

  // Not url.origin: behind the proxy that is the container's own
  // http://localhost:8080, which sent every visitor to a dead address.
  const response = NextResponse.redirect(new URL(destination, portalBase() || url.origin));
  if (campaignId) {
    response.cookies.set(HANDOFF_COOKIE, url.searchParams.get("token") ?? "", HANDOFF_COOKIE_OPTIONS);
  }
  return response;
}
