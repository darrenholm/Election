"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAccessibleCampaigns, getCurrentUser } from "@/lib/auth";
import { ROLE_RANK } from "@/lib/roles";
import { simplifyPlace, tidyPlaceName } from "@/lib/address";

export type HarvestResult = {
  created: number;
  alreadyOnFile: number;
  skipped: number;
  error?: string;
};

/**
 * Turn a list of place names read out of an address file into municipalities.
 *
 * Ontario has 444 municipalities and a candidate should be able to pick theirs
 * from a list rather than typing it and hoping the spelling matches what a
 * colleague typed. The province does not publish that list in a form this app
 * can read, but the address file does contain it — every municipality that
 * publishes address points appears in its municipality column — so the list is
 * harvested from the file the campaign already has.
 *
 * The records created here are empty shells: a name, nothing else. Doors and
 * electors arrive later through the address importer and the clerk's list.
 */
export async function harvestMunicipalities(names: string[]): Promise<HarvestResult> {
  const user = await getCurrentUser();
  if (!user) return { created: 0, alreadyOnFile: 0, skipped: 0, error: "Sign in first." };

  // Municipalities are shared by every campaign in a town, so adding one is not
  // a candidate's decision to make on their own account.
  if (!user.isAdmin) {
    const campaigns = await getAccessibleCampaigns();
    const manages = campaigns.some((c) => ROLE_RANK[c.role] >= ROLE_RANK.MANAGER);
    if (!manages) {
      return {
        created: 0,
        alreadyOnFile: 0,
        skipped: 0,
        error: "Only a campaign manager or an administrator can add municipalities.",
      };
    }
  }

  const existing = await db.municipality.findMany({ select: { name: true } });

  // Match on the loose key, not the exact string: a file writing "WEST GREY"
  // must not create a second town beside the "Municipality of West Grey" that
  // Rebecca's campaign is already running in.
  const seen = new Map<string, string>();
  for (const m of existing) seen.set(simplifyPlace(m.name), m.name);

  const toCreate: string[] = [];
  let alreadyOnFile = 0;
  let skipped = 0;

  for (const raw of names) {
    const name = tidyPlaceName(raw);
    const key = simplifyPlace(name);
    if (key === "") {
      skipped++;
      continue;
    }
    if (seen.has(key)) {
      alreadyOnFile++;
      continue;
    }
    seen.set(key, name);
    toCreate.push(name);
  }

  if (toCreate.length > 0) {
    await db.municipality.createMany({
      data: toCreate.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/", "layout");
  return { created: toCreate.length, alreadyOnFile, skipped };
}

/**
 * Remove a municipality nobody is using. Harvesting a whole province leaves a
 * lot of towns on file that this account will never work in; one that has a
 * campaign, a door or an elector attached is refused.
 */
export async function deleteEmptyMunicipality(municipalityId: string): Promise<HarvestResult> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return { created: 0, alreadyOnFile: 0, skipped: 0, error: "Administrators only." };
  }

  const municipality = await db.municipality.findUnique({
    where: { id: municipalityId },
    include: { _count: { select: { campaigns: true, households: true, voters: true } } },
  });
  if (!municipality) return { created: 0, alreadyOnFile: 0, skipped: 0, error: "Already gone." };

  const { campaigns, households, voters } = municipality._count;
  if (campaigns + households + voters > 0) {
    return {
      created: 0,
      alreadyOnFile: 0,
      skipped: 0,
      error: `${municipality.name} is in use — ${campaigns} campaigns, ${households} doors, ${voters} electors.`,
    };
  }

  await db.municipality.delete({ where: { id: municipalityId } });
  revalidatePath("/", "layout");
  return { created: 0, alreadyOnFile: 0, skipped: 0 };
}
