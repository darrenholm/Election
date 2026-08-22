import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { smsConfig } from "@/lib/sms";
import { TEXT_CAMPAIGN_STATUSES, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { formatPhone } from "@/lib/consent";
import { cancelCampaign, deleteCampaign, queueCampaign } from "@/app/actions/texting";
import { Badge, Card, EmptyState, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { SendRunner } from "./send-runner";

export const dynamic = "force-dynamic";

export default async function TextCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const config = smsConfig();

  const campaign = await db.textCampaign.findUnique({
    where: { id },
    include: {
      messages: {
        include: { voter: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { queuedAt: "asc" },
        take: 500,
      },
      _count: { select: { messages: true } },
    },
  });

  if (!campaign) notFound();

  const counts = campaign.messages.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  const queued = counts.QUEUED ?? 0;
  const delivered = counts.DELIVERED ?? 0;
  const sent = (counts.SENT ?? 0) + delivered;
  const dryRun = campaign.messages.some((m) => m.providerSid === "DRY-RUN");

  const queueIt = queueCampaign.bind(null, campaign.id);
  const cancelIt = cancelCampaign.bind(null, campaign.id);
  const deleteIt = deleteCampaign.bind(null, campaign.id);

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={`Created ${formatDateTime(campaign.createdAt)} · ${campaign._count.messages.toLocaleString("en-CA")} recipients`}
        actions={
          <Link href="/texting" className="btn-secondary">
            All sends
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge
          tone={
            campaign.status === "SENT"
              ? "good"
              : campaign.status === "CANCELLED" || campaign.status === "FAILED"
                ? "bad"
                : campaign.status === "SENDING"
                  ? "brand"
                  : "neutral"
          }
        >
          {label(TEXT_CAMPAIGN_STATUSES, campaign.status)}
        </Badge>
        {dryRun ? <Badge tone="warn">Dry run — nothing was sent</Badge> : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Queued" value={queued} />
        <StatTile label="Sent" value={sent} tone="good" />
        <StatTile label="Delivered" value={delivered} tone="good" />
        <StatTile
          label="Failed or skipped"
          value={(counts.FAILED ?? 0) + (counts.UNDELIVERED ?? 0) + (counts.SKIPPED ?? 0)}
          tone={(counts.FAILED ?? 0) > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="The message">
            <p className="whitespace-pre-wrap rounded-lg bg-raise px-3 py-2 text-sm">
              {campaign.body}
            </p>
            {campaign.messages[0] ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  As the first recipient sees it
                </p>
                <p className="mt-1 rounded-lg border border-line px-3 py-2 text-sm">
                  {campaign.messages[0].body}
                </p>
              </>
            ) : null}
          </Card>

          <Card
            title="Recipients"
            description={
              campaign.messages.length < campaign._count.messages
                ? `Showing the first ${campaign.messages.length} of ${campaign._count.messages}`
                : undefined
            }
          >
            {campaign.messages.length === 0 ? (
              <EmptyState
                title="No recipients"
                hint="Nobody matched the filter — only voters who have agreed to texts and have a usable number are included."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Voter</Th>
                    <Th>Number</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Segments</Th>
                    <Th>Detail</Th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.messages.map((m) => (
                    <tr key={m.id}>
                      <Td>
                        {m.voter ? (
                          <Link href={`/voters/${m.voter.id}`} className="hover:underline">
                            {m.voter.firstName} {m.voter.lastName}
                          </Link>
                        ) : (
                          <span className="text-muted">Voter removed</span>
                        )}
                      </Td>
                      <Td className="tabular-nums text-muted">{formatPhone(m.toPhone)}</Td>
                      <Td>
                        <Badge
                          tone={
                            m.status === "DELIVERED"
                              ? "good"
                              : m.status === "FAILED" || m.status === "UNDELIVERED"
                                ? "bad"
                                : m.status === "SKIPPED"
                                  ? "warn"
                                  : "neutral"
                          }
                        >
                          {m.status}
                        </Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{m.segments}</Td>
                      <Td className="text-xs text-muted">{m.errorMessage || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Send">
            {campaign.status === "DRAFT" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  This is still a draft. Queue it when you are happy with the
                  wording and the audience.
                </p>
                <form action={queueIt}>
                  <button type="submit" className="btn-primary w-full">
                    Queue for sending
                  </button>
                </form>
              </div>
            ) : campaign.status === "CANCELLED" ? (
              <p className="text-sm text-muted">This send was cancelled.</p>
            ) : (
              <SendRunner
                campaignId={campaign.id}
                queued={queued}
                configured={config.configured}
              />
            )}

            <p className="mt-3 text-xs text-muted">
              Estimated cost {formatCents(campaign.estimatedCostCents)} at{" "}
              {formatCents(config.perSegmentCents)} per segment. Twilio&apos;s own
              invoice is the real number.
            </p>
          </Card>

          {!config.configured ? (
            <Note tone="warn">
              Twilio is not configured. Sending will mark everything as a dry run
              so you can rehearse the whole thing safely.
            </Note>
          ) : null}

          <Card title="Manage">
            {queued > 0 && campaign.status !== "CANCELLED" ? (
              <form action={cancelIt} className="mb-3">
                <button type="submit" className="btn-secondary w-full">
                  Cancel the {queued.toLocaleString("en-CA")} still queued
                </button>
              </form>
            ) : null}
            <form action={deleteIt}>
              <button type="submit" className="btn-danger w-full">
                Delete this send
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
              Deleting removes the record of what was sent. Opt-outs are kept
              separately and are never affected.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
