import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { hasRole } from "@/lib/auth";
import { buildCorpus, insightsConfig, type Theme } from "@/lib/insights";
import { formatDate } from "@/lib/dates";
import { generateInsights } from "@/app/actions/insights";
import { Card, EmptyState, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

function readThemes(raw: string): Theme[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Theme[]) : [];
  } catch {
    return [];
  }
}

/**
 * What the doors have been saying.
 *
 * The campaign has been writing notes at every door and never reading them
 * again. This is the other end of that: the themes that recur, how many people
 * raised each, and the streets they cluster on.
 */
export default async function InsightsPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");

  const config = insightsConfig();
  const [latest, notes, canRun] = await Promise.all([
    db.canvassInsight.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { generatedAt: "desc" },
    }),
    buildCorpus(campaign.id),
    hasRole(campaign.id, "MANAGER"),
  ]);

  const themes = latest ? readThemes(latest.themes) : [];
  const stale = latest ? notes.length - latest.notesRead : 0;

  return (
    <>
      <PageHeader
        title="What the doors are saying"
        subtitle="The themes running through your own canvass notes, and where they cluster."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Doors with notes" value={notes.length} />
        <StatTile label="Themes found" value={themes.length} />
        <StatTile
          label="Read at"
          value={latest ? formatDate(latest.generatedAt) : "—"}
        />
        <StatTile
          label="New since"
          value={stale > 0 ? `+${stale}` : "0"}
          tone={stale >= 25 ? "warn" : "neutral"}
        />
      </div>

      {!config.configured ? (
        <Note tone="warn">
          No <code>ANTHROPIC_API_KEY</code> is set on this deployment, so nothing can be read yet.
          Everything else on this page still works.
        </Note>
      ) : null}

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Themes"
            description={
              latest && latest.notesRead > 0
                ? `From ${latest.notesRead} doors, read by ${latest.model || "the model"}.`
                : undefined
            }
          >
            {latest?.error ? (
              <Note tone="warn">{latest.error}</Note>
            ) : themes.length === 0 ? (
              <EmptyState
                title="Nothing read yet"
                hint="Once there are notes on enough doors, read them back and the recurring themes land here."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Theme</Th>
                    <Th>Raised by</Th>
                    <Th>Where</Th>
                  </tr>
                </thead>
                <tbody>
                  {themes.map((theme, i) => (
                    <tr key={`${theme.theme}-${i}`}>
                      <Td>
                        <span className="font-medium">{theme.theme}</span>
                        {theme.summary ? (
                          <span className="mt-0.5 block text-xs text-muted">{theme.summary}</span>
                        ) : null}
                      </Td>
                      <Td className="tabular-nums">{theme.mentions}</Td>
                      <Td className="text-muted">
                        {theme.streets.length > 0
                          ? theme.streets.map((s) => titleCase(s)).join(", ")
                          : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Read the notes back">
            <p className="text-sm text-muted">
              {notes.length} door{notes.length === 1 ? " has" : "s have"} something written on them.
              {stale > 0 && latest
                ? ` ${stale} of those arrived after the last reading.`
                : ""}
            </p>
            {canRun ? (
              <form action={generateInsights} className="mt-3">
                <button type="submit" className="btn-primary w-full">
                  {latest ? "Read them again" : "Read them"}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-accent-ink">
                A campaign manager or the candidate runs this.
              </p>
            )}
          </Card>

          <Card title="What leaves the server">
            <ul className="space-y-1.5 text-xs text-muted">
              <li>
                <strong className="text-ink">Sent:</strong> the note text, the street it was written
                on, and the support level recorded at the time.
              </li>
              <li>
                <strong className="text-ink">Never sent:</strong> names, addresses, phone numbers,
                email addresses. A theme does not need to know who said it.
              </li>
              <li>
                Notes are written by canvassers in their own words, so a note that names somebody
                carries that name with it. The model is told never to repeat one.
              </li>
              <li>
                Readings are kept, so you can show which run produced a claim about the town.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
