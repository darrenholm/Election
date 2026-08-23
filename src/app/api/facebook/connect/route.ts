import { cookies } from "next/headers";
import { requireCampaignId } from "@/lib/campaign";
import { requireCampaign } from "@/lib/guard";
import { authorizeUrl, facebookConfig } from "@/lib/facebook";
import { createSignedValue } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Start the Page connection.
 *
 * The `state` carries the campaign this was started for, signed, so the
 * callback knows which candidate's Page it is being handed without trusting a
 * parameter anyone could type.
 */
export async function GET(request: Request) {
  const config = facebookConfig();
  const back = (reason: string) => Response.redirect(new URL(`/social?connect=${reason}`, request.url), 303);

  if (!config.configured) return back("unconfigured");

  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return back("forbidden");

  const state = createSignedValue(`connect:${campaignId}`, 600);
  // Facebook echoes `state` back, but echoing is not proof it came from this
  // browser, so the same value is dropped in a cookie and compared on return.
  const jar = await cookies();
  jar.set("facebook_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(authorizeUrl(state), 303);
}
