import { createSignedValue, readSignedValue } from "@/lib/session";

/**
 * A link the trade printer can fetch a print file from.
 *
 * Artwork lives in Postgres behind a session check, which is right for a
 * candidate's unreleased sign design — and useless to a printer's fetcher,
 * which has no session. So a job sent out carries a signed, expiring URL
 * instead: it names one file, cannot be edited into naming another, and stops
 * working a fortnight later.
 *
 * The namespace prefix means a token minted for anything else in this app is
 * not accepted here.
 */

const NAMESPACE = "shop-artwork:";

/** Long enough for a trade printer to fetch, short enough not to be a URL that lives forever. */
const TTL_SECONDS = 60 * 60 * 24 * 14;

export function artworkToken(artworkId: string): string {
  return createSignedValue(`${NAMESPACE}${artworkId}`, TTL_SECONDS);
}

export function readArtworkToken(token: string | undefined): string | null {
  const value = readSignedValue(token);
  if (!value || !value.startsWith(NAMESPACE)) return null;
  const id = value.slice(NAMESPACE.length);
  return id === "" ? null : id;
}

export function signedArtworkUrl(artworkId: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/shop/artwork/${artworkId}?token=${encodeURIComponent(artworkToken(artworkId))}`;
}
