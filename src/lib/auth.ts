import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, readSessionToken } from "./session";

/**
 * Who is signed in, and what they are allowed to reach.
 *
 * The rule this file exists to enforce: a candidate sees their own campaign and
 * nothing else. Five people running in the same town share a voters' list but
 * must not be able to read each other's support levels, donors or consent
 * records — so every campaign-scoped query in the app resolves its campaign id
 * through requireCampaignId(), which goes through here.
 */

import { ROLE_RANK, type Role } from "./roles";

export type { Role };

export type SignedInUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

/**
 * The signed-in user, or null. Cached per request: the layout, the page and any
 * action in one render would otherwise each hit the database for the same row.
 */
export const getCurrentUser = cache(async (): Promise<SignedInUser | null> => {
  const jar = await cookies();
  const claims = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isActive: true,
      mustChangePassword: true,
    },
  });

  // A deactivated account keeps its valid cookie until it expires, so the
  // check has to happen on every read rather than only at sign-in.
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    mustChangePassword: user.mustChangePassword,
  };
});

/** True when nobody has been set up yet, which unlocks the one-time setup page. */
export async function needsSetup(): Promise<boolean> {
  return (await db.user.count()) === 0;
}

export type AccessibleCampaign = {
  id: string;
  candidateName: string;
  office: string;
  ward: string;
  municipalityId: string;
  municipalityName: string;
  role: Role;
};

/**
 * Every campaign this user may reach. An admin gets all of them; everyone else
 * gets exactly what they have been granted.
 */
export const getAccessibleCampaigns = cache(
  async (): Promise<AccessibleCampaign[]> => {
    const user = await getCurrentUser();
    if (!user) return [];

    const campaigns = await db.campaign.findMany({
      where: user.isAdmin ? { isActive: true } : { isActive: true, access: { some: { userId: user.id } } },
      include: {
        municipality: { select: { id: true, name: true } },
        access: { where: { userId: user.id }, select: { role: true } },
      },
      orderBy: [{ municipality: { name: "asc" } }, { candidateName: "asc" }],
    });

    return campaigns.map((c) => ({
      id: c.id,
      candidateName: c.candidateName,
      office: c.office,
      ward: c.ward,
      municipalityId: c.municipalityId,
      municipalityName: c.municipality.name,
      role: (c.access[0]?.role ?? (user.isAdmin ? "OWNER" : "VIEWER")) as Role,
    }));
  },
);

/** The user's role on one campaign, or null when they have no access at all. */
export async function roleOn(campaignId: string): Promise<Role | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.isAdmin) return "OWNER";

  const access = await db.campaignAccess.findUnique({
    where: { userId_campaignId: { userId: user.id, campaignId } },
    select: { role: true },
  });
  return (access?.role as Role) ?? null;
}

export async function canAccess(campaignId: string): Promise<boolean> {
  return (await roleOn(campaignId)) !== null;
}

/** Whether the user's role on a campaign is at least the one required. */
export async function hasRole(campaignId: string, minimum: Role): Promise<boolean> {
  const role = await roleOn(campaignId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Finance and texting are restricted to the candidate and their manager.
 * Contribution limits and consent records are not a canvasser's business, and
 * an accidental entry in either is a compliance problem.
 */
export async function canManageMoney(campaignId: string): Promise<boolean> {
  return hasRole(campaignId, "MANAGER");
}
