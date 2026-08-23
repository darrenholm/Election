import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session cookies.
 *
 * The cookie carries the user id and an expiry, signed with an HMAC so it
 * cannot be edited. Nothing secret is stored in it, and no session table is
 * needed — which means signing out on one device does not sign out the others,
 * a trade this app can afford. Rotating SESSION_SECRET invalidates every
 * session at once, which is the lever to pull if something goes wrong.
 */

const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export const SESSION_COOKIE = "campaign_session";

function secret(): string {
  // APP_PASSWORD is accepted for deployments set up before accounts existed,
  // when it was the whole of the app's security. SESSION_SECRET is the one to
  // set now.
  const configured = process.env.SESSION_SECRET || process.env.APP_PASSWORD;
  if (configured && configured.length >= 16) return configured;

  // The development literal is published in this repository. Signing real
  // cookies with it would let anyone who reads the source mint one, so a
  // deployment missing the variable fails loudly instead of running wide open.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set, or is shorter than 16 characters. Set it on " +
        "the deployment and restart — without it, session cookies would be " +
        "signed with a value published in this repository.",
    );
  }

  return "campaign-manager-development-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export type SessionClaims = { userId: string; expiresAt: number };

export function readSessionToken(token: string | undefined): SessionClaims | null {
  if (!token) return null;

  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const [userId, expiresRaw] = payload.split(".");
  const expiresAt = Number(expiresRaw);
  if (!userId || !Number.isFinite(expiresAt)) return null;
  if (expiresAt < Date.now()) return null;

  return { userId, expiresAt };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
