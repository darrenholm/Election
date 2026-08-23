import { cookies } from "next/headers";
import { requireCampaign } from "@/lib/guard";
import { FACEBOOK_HANDOFF_COOKIE, exchangeCodeForUserToken, listPages } from "@/lib/facebook";
import { createSignedValue, readSignedValue } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Where Facebook sends the candidate back.
 *
 * This is a public URL, so nothing here trusts the query string on its own:
 * the signed state says which campaign the connection was started for, the
 * cookie says it was this browser that started it, and the caller is checked
 * against the campaign all over again. A signature proves where a value came
 * from, not who is holding it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (reason: string) => Response.redirect(new URL(`/social?connect=${reason}`, request.url), 303);

  const jar = await cookies();
  const expected = jar.get("facebook_oauth_state")?.value;
  jar.delete("facebook_oauth_state");

  // The candidate pressed cancel on Facebook's dialog.
  if (url.searchParams.get("error")) return back("cancelled");

  const state = url.searchParams.get("state") ?? "";
  if (!expected || state !== expected) return back("state");

  const claim = readSignedValue(state);
  if (!claim?.startsWith("connect:")) return back("state");
  const campaignId = claim.slice("connect:".length);

  if (!(await requireCampaign(campaignId, "MANAGER"))) return back("forbidden");

  const code = url.searchParams.get("code") ?? "";
  if (!code) return back("nocode");

  const token = await exchangeCodeForUserToken(code);
  if (!token.ok) return back("exchange");

  const pages = await listPages(token.token);
  if (!pages.ok) return back("pages");
  if (pages.pages.length === 0) return back("nopages");

  // One Page is the usual case and there is nothing to choose, so connect it
  // and be done. A candidate who also runs a business Page gets a picker.
  if (pages.pages.length === 1) {
    const page = pages.pages[0];
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        facebookPageId: page.id,
        facebookPageName: page.name,
        facebookPageToken: page.accessToken,
        facebookTokenExpiresAt: token.expiresAt,
      },
    });
    return Response.redirect(new URL("/social?connect=ok", request.url), 303);
  }

  // Hand the user token — not the Page tokens — to the picker, in a cookie
  // that dies in a quarter of an hour. The picker fetches the list again
  // rather than carrying a pocketful of Page tokens through the browser.
  jar.set(FACEBOOK_HANDOFF_COOKIE, createSignedValue(`${campaignId}:${token.token}`, 900), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 900,
  });

  return Response.redirect(new URL("/social/connect", request.url), 303);
}
