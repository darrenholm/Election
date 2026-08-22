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
  const claims = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Sign-in and setup have to be reachable signed out, and Twilio's webhooks
  // authenticate themselves with a request signature instead — an opt-out
  // bounced to a login page is an opt-out that never happened.
  matcher: [
    "/((?!login|setup|api/sms|manifest.webmanifest|sw.js|offline.html|icons|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
