import Link from "next/link";
import { db } from "@/lib/db";
import { getCampaign } from "@/lib/campaign";
import { getFinanceSummary, getItemisedContributors } from "@/lib/finance";
import {
  EXPENSE_CATEGORIES,
  ITEMISATION_THRESHOLD_CENTS,
  COMPLIANCE_DISCLAIMER,
} from "@/lib/ontario";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { OFFICES, label } from "@/lib/enums";
import { Card, Note, PageHeader, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * A worksheet laid out in the order of the ministry's Form 4 (Financial
 * Statement — Auditor's Report, Candidate). It is not the form itself: it puts
 * your books in the shape the form expects so the numbers can be transcribed
 * box by box, and so anything missing is obvious before the filing deadline.
 */
export default async function Form4Page() {
  const [campaign, summary, itemised, fundraisers] = await Promise.all([
    getCampaign(),
    getFinanceSummary(),
    getItemisedContributors(),
    db.event.findMany({
      where: { isFundraiser: true },
      include: {
        contributions: { where: { returnedAt: null } },
        expenses: true,
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const smallContributions = summary.contributions.filter((c) => c.returnedAt === null);
  const itemisedIds = new Set(itemised.map((i) => i.contributor.id));
  const under100Cents = smallContributions
    .filter((c) => !c.contributorId || !itemisedIds.has(c.contributorId))
    .reduce((n, c) => n + c.amountCents, 0);
  const itemisedCents = itemised.reduce((n, i) => n + i.totalCents, 0);

  const byCategory = new Map<string, number>();
  for (const expense of summary.expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }

  const subjectCategories = EXPENSE_CATEGORIES.filter((c) => c.subjectToLimit);
  const notSubjectCategories = EXPENSE_CATEGORIES.filter((c) => !c.subjectToLimit);

  return (
    <>
      <PageHeader
        title="Form 4 worksheet"
        subtitle="Your books arranged in the order of the ministry's financial statement."
        actions={
          <>
            <Link href="/finance/export?type=form4" className="btn-secondary">
              Export CSV
            </Link>
            <Link href="/finance/export?type=schedule1" className="btn-secondary">
              Contributor list
            </Link>
          </>
        }
      />

      <div className="mb-6 space-y-3">
        <Note tone="warn">
          This is a worksheet, not a filing. Transcribe the figures onto the
          ministry&apos;s Form 4, and have an auditor review it where the Act
          requires one. {COMPLIANCE_DISCLAIMER}
        </Note>
      </div>

      <div className="space-y-6">
        <Card title="Box A — Name of candidate and office">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Line term="Candidate" value={campaign.candidateName || "—"} />
            <Line term="Office" value={label(OFFICES, campaign.office)} />
            <Line term="Municipality" value={campaign.municipality || "—"} />
            <Line term="Ward or district" value={campaign.ward || "—"} />
            <Line term="Campaign period start" value={formatDate(campaign.campaignPeriodStart)} />
            <Line
              term="Campaign period end"
              value={campaign.campaignPeriodEnd ? formatDate(campaign.campaignPeriodEnd) : "—"}
            />
            <Line term="Voting day" value={formatDate(campaign.votingDay)} />
            <Line
              term="Spending limit"
              value={`${formatCents(summary.limits.spendingLimitCents)}${
                summary.limits.certified.spending ? " (certified)" : " (calculated)"
              }`}
            />
          </dl>
        </Card>

        <Card title="Box B — Summary of campaign income and expenses">
          <Table>
            <tbody>
              <MoneyRow label="Total contributions (Schedule 1)" cents={summary.totalContributionsCents} />
              <MoneyRow label="— of which monetary" cents={summary.monetaryCents} indent />
              <MoneyRow label="— of which in kind, at fair market value" cents={summary.inKindCents} indent />
              <MoneyRow label="Total income" cents={summary.totalContributionsCents} strong />
              <MoneyRow
                label="Expenses subject to the general spending limit"
                cents={summary.subjectToLimitCents}
              />
              <MoneyRow
                label="Expenses for a party or expression of appreciation after voting day"
                cents={summary.partyExpenseCents}
              />
              <MoneyRow
                label="Expenses not subject to the general spending limit"
                cents={summary.notSubjectToLimitCents}
              />
              <MoneyRow label="Total expenses" cents={summary.totalExpensesCents} strong />
              <MoneyRow
                label={summary.balanceCents >= 0 ? "Surplus" : "Deficit"}
                cents={Math.abs(summary.balanceCents)}
                strong
              />
            </tbody>
          </Table>
          {summary.balanceCents > 0 ? (
            <div className="mt-4">
              <Note>
                A surplus must be paid over to the clerk, who holds it in trust
                for a future campaign — it is not the candidate&apos;s to keep.
              </Note>
            </div>
          ) : null}
        </Card>

        <Card
          title="Box C — Statement of campaign income and expenses"
          description="Expense lines in the order the ministry's form prints them."
        >
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Expenses subject to the general spending limit
          </h3>
          <Table>
            <tbody>
              {subjectCategories.map((c) => (
                <MoneyRow key={c.key} label={c.label} cents={byCategory.get(c.key) ?? 0} />
              ))}
              <MoneyRow label="Total subject to the limit" cents={summary.subjectToLimitCents} strong />
            </tbody>
          </Table>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
            Expenses not subject to the general spending limit
          </h3>
          <Table>
            <tbody>
              {notSubjectCategories.map((c) => (
                <MoneyRow key={c.key} label={c.label} cents={byCategory.get(c.key) ?? 0} />
              ))}
              <MoneyRow
                label="Total not subject to the limit"
                cents={summary.notSubjectToLimitCents + summary.partyExpenseCents}
                strong
              />
            </tbody>
          </Table>
        </Card>

        <Card title="Box D — Campaign surplus or deficit">
          <Table>
            <tbody>
              <MoneyRow label="Total income" cents={summary.totalContributionsCents} />
              <MoneyRow label="Total expenses" cents={summary.totalExpensesCents} />
              <MoneyRow
                label={summary.balanceCents >= 0 ? "Surplus for the campaign period" : "Deficit for the campaign period"}
                cents={Math.abs(summary.balanceCents)}
                strong
              />
            </tbody>
          </Table>
        </Card>

        <Card
          title="Schedule 1 — Contributions"
          description={`Part I summary, and Part II itemising everyone over ${formatCents(ITEMISATION_THRESHOLD_CENTS)}.`}
        >
          <Table>
            <tbody>
              <MoneyRow
                label={`Contributions of ${formatCents(ITEMISATION_THRESHOLD_CENTS)} or less`}
                cents={under100Cents}
              />
              <MoneyRow
                label={`Contributions over ${formatCents(ITEMISATION_THRESHOLD_CENTS)} (itemised below)`}
                cents={itemisedCents}
              />
              <MoneyRow label="Total contributions" cents={summary.totalContributionsCents} strong />
            </tbody>
          </Table>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
            Part II — Contributors over {formatCents(ITEMISATION_THRESHOLD_CENTS)}
          </h3>
          {itemised.length === 0 ? (
            <p className="text-sm text-muted">
              No contributor has given more than {formatCents(ITEMISATION_THRESHOLD_CENTS)} in
              total, so Part II is empty.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Address</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Gifts</Th>
                </tr>
              </thead>
              <tbody>
                {itemised.map(({ contributor, totalCents, count }) => (
                  <tr key={contributor.id}>
                    <Td>
                      <Link
                        href={`/finance/contributors/${contributor.id}`}
                        className="font-medium hover:underline"
                      >
                        {contributor.firstName} {contributor.lastName}
                      </Link>
                    </Td>
                    <Td
                      className={
                        contributor.addressLine.trim() === ""
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted"
                      }
                    >
                      {[contributor.addressLine, contributor.city, contributor.postalCode]
                        .filter(Boolean)
                        .join(", ") || "Address missing — required on the filing"}
                    </Td>
                    <Td className="text-right tabular-nums font-medium">
                      {formatCents(totalCents)}
                    </Td>
                    <Td className="tabular-nums text-muted">{count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          title="Schedule 2 — Fundraising events and activities"
          description="One section per fundraising function."
        >
          {fundraisers.length === 0 ? (
            <p className="text-sm text-muted">
              No events are marked as fundraisers. Mark them on the{" "}
              <Link href="/events" className="underline">
                events page
              </Link>{" "}
              and their revenue and costs appear here.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Contributions received</Th>
                  <Th className="text-right">Costs</Th>
                  <Th className="text-right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {fundraisers.map((event) => {
                  const income = event.contributions.reduce((n, c) => n + c.amountCents, 0);
                  const costs = event.expenses.reduce((n, e) => n + e.amountCents, 0);
                  return (
                    <tr key={event.id}>
                      <Td className="font-medium">{event.name}</Td>
                      <Td className="text-muted">{formatDate(event.startsAt)}</Td>
                      <Td className="text-right tabular-nums">{formatCents(income)}</Td>
                      <Td className="text-right tabular-nums">{formatCents(costs)}</Td>
                      <Td className="text-right tabular-nums font-medium">
                        {formatCents(income - costs)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div className="mt-4">
            <Note>
              The cost of holding a fundraising function is excluded from the
              general spending limit, but must still be reported. Where a ticket
              price covers both a contribution and the cost of the event, only
              the contribution portion is a contribution.
            </Note>
          </div>
        </Card>
      </div>
    </>
  );
}

function Line({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line pb-1.5">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function MoneyRow({
  label: name,
  cents,
  strong,
  indent,
}: {
  label: string;
  cents: number;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className={strong ? "font-semibold" : undefined}>
      <Td className={indent ? "pl-8 text-muted" : undefined}>{name}</Td>
      <Td className="w-40 text-right tabular-nums">{formatCents(cents)}</Td>
    </tr>
  );
}
