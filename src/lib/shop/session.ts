import { createSignedValue, readSignedValue } from "@/lib/session";

/**
 * The print portal's own session cookie.
 *
 * Deliberately separate from the campaign manager's. A candidate who orders
 * signs is a customer of the print shop and nothing more — they must never end
 * up holding something the campaign manager would accept as a sign-in, because
 * that side of this deployment holds voters' lists.
 *
 * Two things keep them apart. A different cookie name, so neither is ever sent
 * where the other is read; and a namespace inside the signed value, so a token
 * lifted from one and pasted into the other fails the prefix check even though
 * both are signed with the same SESSION_SECRET.
 */

export const SHOP_SESSION_COOKIE = "holm_shop_session";

const NAMESPACE = "shop-customer:";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function createShopSessionToken(customerId: string): string {
  return createSignedValue(`${NAMESPACE}${customerId}`, MAX_AGE_SECONDS);
}

export function readShopSessionToken(token: string | undefined): string | null {
  const value = readSignedValue(token);
  if (!value || !value.startsWith(NAMESPACE)) return null;
  const id = value.slice(NAMESPACE.length);
  return id === "" ? null : id;
}

export const SHOP_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
