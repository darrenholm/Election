import { cookies } from "next/headers";
import { createSignedValue, readSignedValue } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Arriving at the shop from the campaign manager.
 *
 * A candidate already running their campaign in this app has typed their name,
 * their office, their town and their ward once. Making them type it again to
 * buy signs is the kind of small insult software is full of, so the campaign
 * manager links across with a signed token naming the campaign, and the
 * storefront fills the form in.
 *
 * The two halves may be on different domains — electionmgr.ca and the shop —
 * so a shared cookie cannot be relied on. A signed token in the link works
 * across any domain and cannot be forged, because it is signed with the same
 * SESSION_SECRET as everything else.
 *
 * WHAT THIS IS NOT: it is not a sign-in. It fills in a form and nothing more.
 * Somebody holding a stolen link gets a registration page with a candidate's
 * name and town already in it — facts that are on the ballot — and no access to
 * the campaign, its voters, its money, or the shop account they would still
 * have to create with a password of their own. That is why it is deliberately
 * a prefill and not a session.
 */

export const HANDOFF_COOKIE = "holm_portal_prefill";

const NAMESPACE = "shop-handoff:";

/** Long enough to finish registering, short enough that a shared link goes stale. */
const TTL_SECONDS = 60 * 60;

export function createCampaignHandoff(campaignId: string): string {
  return createSignedValue(`${NAMESPACE}${campaignId}`, TTL_SECONDS);
}

export function readCampaignHandoff(token: string | undefined): string | null {
  const value = readSignedValue(token);
  if (!value || !value.startsWith(NAMESPACE)) return null;
  const id = value.slice(NAMESPACE.length);
  return id === "" ? null : id;
}

export const HANDOFF_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_SECONDS,
};

export type Prefill = {
  candidateName: string;
  office: string;
  municipality: string;
  ward: string;
  contactName: string;
  email: string;
  phone: string;
};

/**
 * What the campaign says about itself, for the registration and checkout forms.
 *
 * Only the things a print order needs, and only things already public about a
 * candidacy. Nothing about voters, money or messages crosses over.
 */
export async function prefillFromCampaign(campaignId: string): Promise<Prefill | null> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      candidateName: true,
      office: true,
      ward: true,
      contactEmail: true,
      contactPhone: true,
      municipality: { select: { name: true } },
    },
  });
  if (!campaign) return null;

  return {
    candidateName: campaign.candidateName,
    office: campaign.office,
    municipality: campaign.municipality.name,
    ward: campaign.ward,
    // The campaign's public contact, which is usually the candidate themselves.
    contactName: campaign.candidateName,
    email: campaign.contactEmail,
    phone: campaign.contactPhone,
  };
}

/** The prefill waiting in this browser, if a handoff link was followed. */
export async function pendingPrefill(): Promise<Prefill | null> {
  const jar = await cookies();
  const campaignId = readCampaignHandoff(jar.get(HANDOFF_COOKIE)?.value);
  if (!campaignId) return null;
  return prefillFromCampaign(campaignId);
}

/**
 * The link from the campaign manager to the shop.
 *
 * Goes through /api/shop/handoff so the token lands in a cookie and survives
 * the walk from the catalogue to the form. PORTAL_URL when the shop is on its
 * own domain; otherwise the app's own, since both halves are one deployment.
 */
function portalBase(): string {
  return (process.env.PORTAL_URL || process.env.APP_URL || "").replace(/\/$/, "");
}

export function portalOrderUrl(campaignId: string, next = "/election/products/signs"): string {
  const query = `token=${encodeURIComponent(createCampaignHandoff(campaignId))}&next=${encodeURIComponent(next)}`;
  return `${portalBase()}/api/shop/handoff?${query}`;
}

/**
 * The storefront's front page, for a link with no campaign in scope — an
 * administrator who has not picked one, say. No handoff token, because with no
 * campaign there is nothing to fill in.
 */
export function portalHomeUrl(): string {
  return `${portalBase()}/election`;
}
