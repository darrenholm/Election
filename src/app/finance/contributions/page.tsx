import Link from "next/link";
import { db } from "@/lib/db";
import { getContributorTotals } from "@/lib/finance";
import { getActiveCampaign, getLimits } from "@/lib/campaign";
import { redirect } from "next/navigation";
import { CONTRIBUTION_METHODS, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { createContributor, deleteContribution, issueReceipt, returnContribution, undoReturn } from "@/app/actions/finance";
import { Badge, Card, Check, EmptyState, Field, PageHeader, Table, Td, Th } from "@/components/ui";
import { ContributionForm, type ContributorOption } from "./contribution-form";

export const dynamic = "force-dynamic";

export default async function ContributionsPage() {
  const campaign = await getActiveCampaign();
  if (!campaign) redirect("/campaigns");
  const campaignId = campaign.id;

  const [limits, contributors, contributions, events, totals] = await Promise.all([
    getLimits(),
    db.contributor.findMany({ where: { campaignId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    db.contribution.findMany({
      where: { campaignId },
      include: { contributor: true, event: true },
      orderBy: { receivedAt: "desc" },
      take: 300,
    }),
    db.event.findMany({
      where: { campaignId, isFundraiser: true },
      orderBy: { startsAt: "desc" },
      select: { id: true, name: true },
    }),
    getContributorTotals(),
  ]);

  const options: ContributorOption[] = contributors.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim() || "Unnamed contributor",
    totalCents: totals.get(c.id) ?? 0,
    ontarioResident: c.ontarioResident,
    isCandidate: c.isCandidate,
    isCandidateSpouse: c.isCandidateSpouse,
    hasAddress: c.addressLine.trim() !== "" && c.city.trim() !== "",
  }));

  const liveTotal = contributions
    .filter((c) => c.returnedAt === null)
    .reduce((n, c) => n + c.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle={`${formatCents(liveTotal)} recorded across ${contributions.length} entries`}
        actions={
          <Link href="/finance/export?type=contributions" className="btn-secondary">
            Export CSV
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Ledger">
            {contributions.length === 0 ? (
              <EmptyState
                title="No contributions recorded"
                hint="Add a contributor on the right, then record what they gave."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Contributor</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Received</Th>
                    <Th>Method</Th>
                    <Th>Receipt</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {contributions.map((c) => {
                    const receipt = issueReceipt.bind(null, c.id);
                    const revert = undoReturn.bind(null, c.id);
                    const remove = deleteContribution.bind(null, c.id);
                    const markReturned = returnContribution.bind(null, c.id);
                    return (
                      <tr key={c.id} className={c.returnedAt ? "opacity-60" : undefined}>
                        <Td>
                          {c.contributor ? (
                            <Link
                              href={`/finance/contributors/${c.contributorId}`}
                              className="font-medium hover:underline"
                            >
                              {c.contributor.firstName} {c.contributor.lastName}
                            </Link>
                          ) : c.isAnonymous ? (
                            <span className="text-muted">Anonymous</span>
                          ) : (
                            <span className="text-accent-ink">
                              No contributor recorded
                            </span>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.isInKind ? <Badge tone="brand">In kind</Badge> : null}
                            {c.event ? <Badge>{c.event.name}</Badge> : null}
                            {c.returnedAt ? (
                              <Badge tone="bad">Returned {formatDate(c.returnedAt)}</Badge>
                            ) : null}
                          </div>
                          {c.inKindDescription ? (
                            <p className="mt-0.5 text-xs text-muted">{c.inKindDescription}</p>
                          ) : null}
                        </Td>
                        <Td className="text-right tabular-nums font-medium">
                          {formatCents(c.amountCents)}
                        </Td>
                        <Td className="text-muted">{formatDate(c.receivedAt)}</Td>
                        <Td className="text-muted">{label(CONTRIBUTION_METHODS, c.method)}</Td>
                        <Td>
                          {c.receiptNumber ? (
                            <span className="tabular-nums text-xs">{c.receiptNumber}</span>
                          ) : (
                            <form action={receipt}>
                              <button type="submit" className="btn-ghost text-xs">
                                Issue
                              </button>
                            </form>
                          )}
                        </Td>
                        <Td>
                          {c.returnedAt ? (
                            <form action={revert}>
                              <button type="submit" className="btn-ghost text-xs">
                                Undo return
                              </button>
                            </form>
                          ) : (
                            <details>
                              <summary className="cursor-pointer text-xs text-muted">
                                Return
                              </summary>
                              <form action={markReturned} className="mt-2 space-y-2">
                                <input
                                  name="returnReason"
                                  placeholder="Reason"
                                  className="field text-xs"
                                />
                                <input name="returnedAt" type="date" className="field text-xs" />
                                <button type="submit" className="btn-danger w-full text-xs">
                                  Mark returned
                                </button>
                              </form>
                            </details>
                          )}
                          <form action={remove} className="mt-1">
                            <button type="submit" className="btn-ghost text-xs">
                              Delete
                            </button>
                          </form>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Record a contribution">
            <ContributionForm
              contributors={options}
              events={events}
              selfFundingLimitCents={limits?.selfFundingLimitCents ?? 0}
            />
          </Card>

          <Card title="Add a contributor">
            <form action={createContributor} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <input name="firstName" className="field" required />
                </Field>
                <Field label="Last name">
                  <input name="lastName" className="field" />
                </Field>
              </div>
              <Field label="Address" hint="Required on Form 4 for anyone giving over $100.">
                <input name="addressLine" className="field" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="City">
                  <input name="city" className="field" />
                </Field>
                <Field label="Postal code">
                  <input name="postalCode" className="field" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <input name="email" type="email" className="field" />
                </Field>
                <Field label="Phone">
                  <input name="phone" type="tel" className="field" />
                </Field>
              </div>
              <div className="space-y-2">
                <Check
                  name="ontarioResident"
                  label="Individual normally resident in Ontario"
                  defaultChecked
                />
                <Check name="isCandidate" label="This is the candidate" />
                <Check name="isCandidateSpouse" label="Spouse of the candidate" />
              </div>
              <p className="text-xs text-muted">
                Corporations and trade unions cannot contribute to Ontario
                municipal campaigns.
              </p>
              <button type="submit" className="btn-secondary w-full">
                Add contributor
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
