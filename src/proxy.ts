import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, isValidSession } from "@/lib/auth";

export default async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Preserve where the user was headed so sign-in lands them back there.
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login route, Twilio's webhooks, Next's own assets
  // and static files. The webhooks authenticate themselves with Twilio's
  // request signature instead — see src/app/api/sms/webhook/route.ts — because
  // a provider callback cannot sign in with a shared password, and an opt-out
  // that gets bounced to a login page is an opt-out that never happened.
  matcher: [
    "/((?!login|api/sms|manifest.webmanifest|sw.js|offline.html|icons|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
