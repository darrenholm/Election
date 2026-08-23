"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCampaignId } from "@/lib/campaign";
import { requireCampaign } from "@/lib/guard";
import { buildCorpus, insightsConfig, readCanvass } from "@/lib/insights";

/** Below this a "theme" is one person's opinion wearing a hat. */
const MINIMUM_NOTES = 10;

/**
 * Read the canvass back.
 *
 * Manager-and-up: it spends money on the API, and what it produces is a claim
 * about the town that the campaign may well act on.
 *
 * Failures are written to the row rather than thrown. The page is reached by a
 * plain form post, and a candidate who clicks a button and gets a stack trace
 * learns nothing about the bad key that actually caused it.
 */
export async function generateInsights(): Promise<void> {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;

  const config = insightsConfig();
  const lines = await buildCorpus(campaignId);

  const record = async (fields: { notesRead: number; themes: string; error: string }) => {
    await db.canvassInsight.create({
      data: { campaignId, model: config.model, ...fields },
    });
    revalidatePath("/insights");
  };

  if (!config.configured) {
    await record({
      notesRead: lines.length,
      themes: "[]",
      error: "No ANTHROPIC_API_KEY is set on this deployment, so nothing was read.",
    });
    return;
  }

  if (lines.length < MINIMUM_NOTES) {
    await record({
      notesRead: lines.length,
      themes: "[]",
      error:
        `Only ${lines.length} doors have notes on them. Knock a few more before reading anything ` +
        "into them — with this many, a theme is one person's opinion wearing a hat.",
    });
    return;
  }

  try {
    const themes = await readCanvass(lines, config);
    await record({ notesRead: lines.length, themes: JSON.stringify(themes), error: "" });
  } catch (error) {
    await record({
      notesRead: lines.length,
      themes: "[]",
      error: error instanceof Error ? error.message : "The reading failed.",
    });
  }
}
