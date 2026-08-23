import { db } from "./db";

/**
 * Reading the campaign's own canvass notes back.
 *
 * Every door leaves a line of free text — what they asked about, what was
 * promised, why somebody is worth another visit — and after four hundred doors
 * nobody ever reads it again. It is the richest thing a campaign owns and it is
 * write-only. This turns it back into something a candidate can act on: what
 * keeps coming up, how often, and on which streets.
 *
 * What leaves the server is deliberately narrow. Names, addresses, phone
 * numbers and email addresses are never sent: a theme does not need to know who
 * said it, only how many said it and roughly where. What goes out is the note
 * text, the street it was written on, and the support level at the time.
 *
 * With no API key the whole thing still runs and reports itself as
 * unconfigured, the same way texting and Facebook do — a campaign can see
 * exactly what would be read before anyone opens an account.
 */

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export type InsightsConfig = {
  configured: boolean;
  apiKey: string;
  model: string;
};

export function insightsConfig(): InsightsConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  return {
    configured: apiKey !== "",
    apiKey,
    // Pinned by environment so a model that is retired, or one that turns out
    // to read the notes better, is a variable change rather than a deploy.
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
  };
}

/** One note, stripped of the person who said it. */
export type CorpusLine = {
  street: string;
  supportLevel: number | null;
  text: string;
};

export type Theme = {
  theme: string;
  mentions: number;
  streets: string[];
  summary: string;
};

/**
 * The notes worth reading, newest first.
 *
 * Only three fields are selected, and none of them identify anybody. The voter
 * relation is not touched at all — the household is joined for its street name
 * and nothing else.
 */
export async function buildCorpus(campaignId: string, limit = 600): Promise<CorpusLine[]> {
  const contacts = await db.contactAttempt.findMany({
    where: {
      campaignId,
      OR: [
        { notes: { not: "" } },
        { followUpReason: { not: "" } },
        { issues: { not: "" } },
      ],
    },
    select: {
      notes: true,
      followUpReason: true,
      issues: true,
      supportLevel: true,
      household: { select: { streetName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  const lines: CorpusLine[] = [];
  for (const contact of contacts) {
    const parts = [contact.issues, contact.notes, contact.followUpReason]
      .map((p) => p.trim())
      .filter((p) => p !== "");
    if (parts.length === 0) continue;

    lines.push({
      street: contact.household?.streetName ?? "",
      supportLevel: contact.supportLevel,
      text: parts.join(" — "),
    });
  }
  return lines;
}

const SYSTEM = [
  "You are reading the canvassing notes of a candidate in an Ontario municipal election.",
  "Each line is one conversation at a door: the street, the support level recorded at the time (1 = strong support, 5 = strong oppose, blank = not identified), and what the canvasser wrote down.",
  "Find the themes that actually recur. A theme is something several people raised, not something one person said memorably.",
  "Never reproduce a personal name. If a note names somebody, describe them by role or leave them out.",
  "Do not invent a count. `mentions` is how many of the supplied lines touch the theme.",
  "Order themes by how many people raised them, most first. Return at most 12.",
  "Reply with JSON only — an array of objects with keys: theme (3-6 words), mentions (integer), streets (array of up to 5 street names where it clusters, from the supplied streets only), summary (one sentence, what these people actually want).",
].join(" ");

/** Pull the JSON array out of a reply, whether or not it arrived fenced. */
function parseThemes(raw: string): Theme[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("The reading came back in a shape we could not read.");

  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("The reading came back in a shape we could not read.");

  const themes: Theme[] = [];
  for (const row of parsed) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const theme = typeof r.theme === "string" ? r.theme.trim() : "";
    if (theme === "") continue;

    themes.push({
      theme,
      mentions: typeof r.mentions === "number" && Number.isFinite(r.mentions) ? Math.round(r.mentions) : 0,
      streets: Array.isArray(r.streets)
        ? r.streets.filter((s): s is string => typeof s === "string").slice(0, 5)
        : [],
      summary: typeof r.summary === "string" ? r.summary.trim() : "",
    });
  }
  return themes;
}

export async function readCanvass(lines: CorpusLine[], config: InsightsConfig): Promise<Theme[]> {
  if (!config.configured) throw new Error("No ANTHROPIC_API_KEY is set on this deployment.");

  const body = lines
    .map((l) => {
      const where = l.street === "" ? "no street" : l.street;
      const support = l.supportLevel === null ? "-" : String(l.supportLevel);
      return `[${where} | support ${support}] ${l.text}`;
    })
    .join("\n");

  const response = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: `${lines.length} notes:\n\n${body}` }],
    }),
  });

  if (!response.ok) {
    // The status is worth keeping: 401 is a bad key, 429 is a spending cap,
    // and a candidate reading "something went wrong" learns neither.
    const detail = await response.text().catch(() => "");
    throw new Error(`The model refused the request (${response.status}). ${detail.slice(0, 200)}`);
  }

  const payload: unknown = await response.json();
  const content = (payload as { content?: { type?: string; text?: string }[] }).content ?? [];
  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");

  if (text.trim() === "") throw new Error("The model replied with nothing.");
  return parseThemes(text);
}
