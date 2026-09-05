import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";

/**
 * The front door.
 *
 * Everything except sign-in, the one-time setup page and Twilio's webhooks
 * requires a valid session. The signature is verified here — cheap, no database
 * — and whether the account is still active is re-checked by getCurrentUser()
 * on the request itself, since a deactivated user keeps a technically valid
 * cookie until it expires.
 */
export default async function proxy(request: NextRequest) {
  // A domain that exists to serve the storefront should serve it at its own
  // root. Without this, a candidate who types election.holmgraphics.ca lands on
  // the campaign manager's sign-in page, which is both wrong and alarming.
  //
  // Set PORTAL_HOST to that domain. Unset, nothing changes.
  const portalHost = process.env.PORTAL_HOST;
  if (
    portalHost &&
    request.nextUrl.pathname === "/" &&
    request.headers.get("host")?.split(":")[0]?.toLowerCase() === portalHost.toLowerCase()
  ) {
    return NextResponse.redirect(new URL("/election", request.url));
  }

  const claims = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Sign-in and setup have to be reachable signed out; Twilio's webhooks
  // authenticate themselves with a request signature instead — an opt-out
  // bounced to a login page is an opt-out that never happened; and the health
  // check has to answer the platform, which has no session.
  //
  // The election print portal is a shopfront: a candidate who has never dealt
  // with this shop reaches it from a search result, so /election is outside the
  // gate entirely and signs its customers in against its own session (see
  // src/lib/shop/session.ts). /api/shop serves their artwork and does its own
  // check, because the caller may legitimately be a customer rather than one of
  // the campaign manager's users.
  matcher: [
    "/((?!login|setup|election|api/shop|api/sms|api/health|manifest.webmanifest|sw.js|offline.html|icons|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
