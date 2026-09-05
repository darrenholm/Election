import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveCampaign } from "@/lib/campaign";
import { smsConfig } from "@/lib/sms";
import { buildAudience } from "@/lib/sms";
import { TEXT_CAMPAIGN_STATUSES, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, EmptyState, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TextingPage() {
  const config = smsConfig();
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const [campaigns, consentCounts, optOuts, audience] = await Promise.all([
    db.textCampaign.findMany({
      where: { campaignId },
      include: { _count: { select: { messages: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.voterCampaignState.groupBy({ by: ["smsConsent"], where: { campaignId }, _count: true }),
    db.smsOptOut.count({ where: { campaignId } }),
    buildAudience({}, campaignId),
  ]);

  const consent = new Map(consentCounts.map((c) => [c.smsConsent, c._count]));

  return (
    <>
      <PageHeader
        title="Text messages"
        subtitle="Bulk texts to voters who have agreed to receive them."
        actions={
          <>
            <Link href="/texting/consent" className="btn-secondary">
              Consent register
            </Link>
            <Link href="/texting/new" className="btn-primary">
              New message
            </Link>
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {!config.configured ? (
          <Note tone="warn">
            <strong>Twilio is not configured, so nothing can actually send.</strong>{" "}
            Everything else works — you can build audiences, write messages and
            check costs in dry-run mode. Add <code>TWILIO_ACCOUNT_SID</code>,{" "}
            <code>TWILIO_AUTH_TOKEN</code> and either{" "}
            <code>TWILIO_MESSAGING_SERVICE_SID</code> or{" "}
            <code>TWILIO_FROM_NUMBER</code> to <code>.env</code> when you are ready.
          </Note>
        ) : null}
        <Note>
          Only voters who gave express consent are ever included, every message
          carries an opt-out, and a STOP reply blocks that number permanently.
          Those rules are enforced at send time, not just in this screen.
        </Note>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Can be texted"
          value={audience.length.toLocaleString("en-CA")}
          hint="Consented, reachable, not opted out"
          tone="good"
        />
        <StatTile label="Agreed" value={(consent.get("GRANTED") ?? 0).toLocaleString("en-CA")} />
        <StatTile label="Said no" value={(consent.get("DECLINED") ?? 0).toLocaleString("en-CA")} />
        <StatTile
          label="Opted out"
          value={optOuts.toLocaleString("en-CA")}
          hint="Texted STOP"
          tone={optOuts > 0 ? "warn" : "neutral"}
        />
      </div>

      <Card title="Sends">
        {campaigns.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            hint="Write a message, check who it reaches and what it costs, then send it."
            action={
              <Link href="/texting/new" className="btn-primary">
                Write a message
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th className="text-right">Recipients</Th>
                <Th className="text-right">Est. cost</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-raise">
                  <Td>
                    <Link href={`/texting/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{c.body}</p>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        c.status === "SENT"
                          ? "good"
                          : c.status === "FAILED" || c.status === "CANCELLED"
                            ? "bad"
                            : c.status === "SENDING"
                              ? "brand"
                              : "neutral"
                      }
                    >
                      {label(TEXT_CAMPAIGN_STATUSES, c.status)}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{c._count.messages}</Td>
                  <Td className="text-right tabular-nums">
                    {formatCents(c.estimatedCostCents)}
                  </Td>
                  <Td className="text-muted">{formatDateTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
