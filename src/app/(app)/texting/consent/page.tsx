import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { SMS_CONSENT_SOURCES, SMS_CONSENT_STATES, label } from "@/lib/enums";
import { formatPhone } from "@/lib/consent";
import { formatDate } from "@/lib/dates";
import { addOptOut, removeOptOut } from "@/app/actions/texting";
import { Badge, Card, EmptyState, Field, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { titleCase } from "@/components/voter";

export const dynamic = "force-dynamic";

/**
 * The consent register: who agreed, when, through what wording, and who has
 * opted out. This is the page you open if anyone ever asks why a particular
 * person received a text.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state = "GRANTED" } = await searchParams;

  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const [records, counts, optOuts] = await Promise.all([
    db.voterCampaignState.findMany({
      where: {
        campaignId,
        ...(state === "ALL" ? { NOT: { smsConsent: "UNKNOWN" } } : { smsConsent: state }),
      },
      orderBy: { smsConsentAt: "desc" },
      take: 300,
      include: {
        voter: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    }),
    db.voterCampaignState.groupBy({ by: ["smsConsent"], where: { campaignId }, _count: true }),
    db.smsOptOut.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const voters = records.map((r) => ({
    id: r.voter.id,
    firstName: r.voter.firstName,
    lastName: r.voter.lastName,
    phone: r.voter.phone,
    smsConsent: r.smsConsent,
    smsConsentAt: r.smsConsentAt,
    smsConsentSource: r.smsConsentSource,
    smsConsentWording: r.smsConsentWording,
  }));

  const byState = new Map(counts.map((c) => [c.smsConsent, c._count]));

  return (
    <>
      <PageHeader
        title="Consent register"
        subtitle={`Who agreed to hear from ${campaign.candidateName}, when, and in what words.`}
        actions={
          <Link href="/texting" className="btn-secondary">
            Back to sends
          </Link>
        }
      />

      <div className="mb-6">
        <Note>
          Consent is recorded with the exact wording read to the voter and the
          moment they gave it, and belongs to this campaign alone — agreeing to
          hear from one candidate says nothing about the others. Keep it for the
          life of the campaign: a consent record you cannot produce the script
          for is not much of a record.
        </Note>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Agreed" value={(byState.get("GRANTED") ?? 0).toLocaleString("en-CA")} tone="good" href="/texting/consent?state=GRANTED" />
        <StatTile label="Said no" value={(byState.get("DECLINED") ?? 0).toLocaleString("en-CA")} href="/texting/consent?state=DECLINED" />
        <StatTile label="Opted out" value={(byState.get("REVOKED") ?? 0).toLocaleString("en-CA")} tone="warn" href="/texting/consent?state=REVOKED" />
        <StatTile label="Never asked" value={(byState.get("UNKNOWN") ?? 0).toLocaleString("en-CA")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title={`${label(SMS_CONSENT_STATES, state) || "All recorded"}`}
            description={`${voters.length} shown`}
            actions={
              <form className="flex gap-2">
                <select name="state" defaultValue={state} className="field w-40">
                  <option value="GRANTED">Agreed</option>
                  <option value="DECLINED">Said no</option>
                  <option value="REVOKED">Opted out</option>
                  <option value="ALL">Everyone asked</option>
                </select>
                <button type="submit" className="btn-secondary">
                  Show
                </button>
              </form>
            }
          >
            {voters.length === 0 ? (
              <EmptyState
                title="Nothing recorded in this state"
                hint="Consent is captured at the door when a canvasser logs a contact."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Voter</Th>
                    <Th>Number</Th>
                    <Th>State</Th>
                    <Th>When</Th>
                    <Th>How</Th>
                  </tr>
                </thead>
                <tbody>
                  {voters.map((v) => (
                    <tr key={v.id} className="hover:bg-raise">
                      <Td>
                        <Link href={`/voters/${v.id}`} className="font-medium hover:underline">
                          {titleCase(v.firstName)} {titleCase(v.lastName)}
                        </Link>
                        {v.smsConsentWording ? (
                          <details className="mt-0.5">
                            <summary className="cursor-pointer text-xs text-muted">
                              Wording used
                            </summary>
                            <p className="mt-1 text-xs italic text-muted">
                              &ldquo;{v.smsConsentWording}&rdquo;
                            </p>
                          </details>
                        ) : null}
                      </Td>
                      <Td className="tabular-nums text-muted">
                        {v.phone ? formatPhone(v.phone) : "—"}
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            v.smsConsent === "GRANTED"
                              ? "good"
                              : v.smsConsent === "REVOKED"
                                ? "bad"
                                : "neutral"
                          }
                        >
                          {label(SMS_CONSENT_STATES, v.smsConsent)}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{formatDate(v.smsConsentAt)}</Td>
                      <Td className="text-muted">
                        {v.smsConsentSource
                          ? label(SMS_CONSENT_SOURCES, v.smsConsentSource)
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
          <Card title="Opt-out list" description={`${optOuts.length} numbers blocked`}>
            <Note tone="warn">
              These numbers are blocked permanently, whatever any voter record
              says. A STOP belongs to the handset, not the person, so this list
              survives edits, imports and merges.
            </Note>

            {optOuts.length > 0 ? (
              <ul className="mt-3 divide-y divide-line">
                {optOuts.map((o) => {
                  const remove = removeOptOut.bind(null, o.phone);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="tabular-nums text-sm font-medium">
                          {formatPhone(o.phone)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {o.reason} · {formatDate(o.createdAt)}
                        </p>
                      </div>
                      <form action={remove}>
                        <button type="submit" className="btn-ghost text-xs">
                          Remove
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Nobody has opted out.</p>
            )}

            <p className="mt-3 text-xs text-muted">
              Only remove a number if the person has asked to be put back on, and
              record fresh consent from them separately.
            </p>
          </Card>

          <Card title="Add an opt-out by hand">
            <form action={addOptOut} className="space-y-3">
              <Field label="Number" hint="Someone who asked to be removed in person or by phone.">
                <input name="phone" type="tel" className="field" placeholder="519-555-0134" required />
              </Field>
              <Field label="Reason">
                <input name="reason" className="field" placeholder="Asked at the door" />
              </Field>
              <button type="submit" className="btn-secondary w-full">
                Block this number
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
