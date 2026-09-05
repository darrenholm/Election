import Link from "next/link";
import { db } from "@/lib/db";
import { auditContributions, getExpensesByCategory, getFinanceSummary } from "@/lib/finance";
import { formatCents, formatCentsShort } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CONTRIBUTION_LIMIT_CENTS, COMPLIANCE_DISCLAIMER } from "@/lib/ontario";
import { Badge, Card, EmptyState, LimitBar, Note, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FinanceOverview() {
  const [summary, flags, byCategory, topContributors] = await Promise.all([
    getFinanceSummary(),
    auditContributions(),
    getExpensesByCategory(),
    db.contributor.findMany({
      include: { contributions: { where: { returnedAt: null } } },
      take: 200,
    }),
  ]);

  const ranked = topContributors
    .map((c) => ({
      contributor: c,
      totalCents: c.contributions.reduce((n, x) => n + x.amountCents, 0),
    }))
    .filter((c) => c.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 8);

  const errors = flags.filter((f) => f.flags.some((x) => x.level === "error"));
  const warnings = flags.filter((f) => !f.flags.some((x) => x.level === "error"));

  return (
    <>
      <PageHeader
        title="Campaign finance"
        subtitle={
          summary.limits.certified.spending
            ? "Using the clerk's certified spending limit."
            : "Using the statutory formula — enter the clerk's certified limit in Settings."
        }
        actions={
          <>
            <Link href="/finance/contributions" className="btn-secondary">
              Record a contribution
            </Link>
            <Link href="/finance/expenses" className="btn-primary">
              Record an expense
            </Link>
          </>
        }
      />

      <div className="mb-6">
        <Note>{COMPLIANCE_DISCLAIMER}</Note>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Raised"
          value={formatCentsShort(summary.totalContributionsCents)}
          hint={`${formatCentsShort(summary.inKindCents)} of it in kind`}
        />
        <StatTile label="Spent" value={formatCentsShort(summary.totalExpensesCents)} />
        <StatTile
          label="On hand"
          value={formatCentsShort(summary.balanceCents)}
          tone={summary.balanceCents < 0 ? "bad" : "good"}
          hint={summary.balanceCents < 0 ? "Campaign is in deficit" : undefined}
        />
        <StatTile
          label="Compliance items"
          value={flags.length}
          tone={errors.length > 0 ? "bad" : flags.length > 0 ? "warn" : "good"}
          hint={errors.length > 0 ? `${errors.length} need action` : "Nothing outstanding"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Against the limits">
            <div className="space-y-5">
              <LimitBar
                label="General spending limit"
                value={summary.subjectToLimitCents}
                limit={summary.limits.spendingLimitCents}
                valueLabel={formatCents(summary.subjectToLimitCents)}
                limitLabel={formatCents(summary.limits.spendingLimitCents)}
              />
              <LimitBar
                label="Appreciation party (10% of the general limit)"
                value={summary.partyExpenseCents}
                limit={summary.limits.partyExpenseLimitCents}
                valueLabel={formatCents(summary.partyExpenseCents)}
                limitLabel={formatCents(summary.limits.partyExpenseLimitCents)}
              />
              <LimitBar
                label="Candidate and spouse self-funding"
                value={summary.selfFundingCents}
                limit={summary.limits.selfFundingLimitCents}
                valueLabel={formatCents(summary.selfFundingCents)}
                limitLabel={formatCents(summary.limits.selfFundingLimitCents)}
              />
            </div>
            <p className="mt-4 text-xs text-muted">
              {formatCents(summary.notSubjectToLimitCents)} of spending sits
              outside the general limit — audit fees, fundraising costs and the
              other categories the Act excludes.
            </p>
          </Card>

          <Card
            title="Needs attention"
            description="Every contribution on file, re-checked against the Act."
          >
            {flags.length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                hint="Contribution limits, eligibility, cash rules and receipts all check out."
              />
            ) : (
              <ul className="divide-y divide-line">
                {[...errors, ...warnings].map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {item.contributorId ? (
                          <Link
                            href={`/finance/contributors/${item.contributorId}`}
                            className="hover:underline"
                          >
                            {item.contributorName}
                          </Link>
                        ) : (
                          item.contributorName
                        )}{" "}
                        <span className="tabular-nums text-muted">
                          {formatCents(item.amountCents)}
                        </span>
                      </p>
                      <span className="text-xs text-muted">{formatDate(item.receivedAt)}</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {item.flags.map((flag) => (
                        <li
                          key={flag.code}
                          className={`text-sm ${
                            flag.level === "error"
                              ? "text-accent-ink"
                              : "text-accent-ink"
                          }`}
                        >
                          {flag.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Spending by category">
            {byCategory.length === 0 ? (
              <EmptyState title="No expenses recorded yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th>Items</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Counts against limit</Th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((row) => (
                    <tr key={row.category.key}>
                      <Td>{row.category.label}</Td>
                      <Td className="tabular-nums text-muted">{row.count}</Td>
                      <Td className="text-right tabular-nums font-medium">
                        {formatCents(row.totalCents)}
                      </Td>
                      <Td>
                        {row.category.partyExpense ? (
                          <Badge tone="warn">Party limit</Badge>
                        ) : row.category.subjectToLimit ? (
                          <Badge tone="brand">Yes</Badge>
                        ) : (
                          <Badge>No</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Largest contributors">
            {ranked.length === 0 ? (
              <EmptyState title="No contributions yet" />
            ) : (
              <ul className="space-y-2.5">
                {ranked.map(({ contributor, totalCents }) => {
                  const pct = Math.min(100, (totalCents / CONTRIBUTION_LIMIT_CENTS) * 100);
                  const selfFunded = contributor.isCandidate || contributor.isCandidateSpouse;
                  return (
                    <li key={contributor.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link
                          href={`/finance/contributors/${contributor.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {contributor.firstName} {contributor.lastName}
                        </Link>
                        <span className="tabular-nums">{formatCents(totalCents)}</span>
                      </div>
                      {!selfFunded ? (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-raise">
                          <div
                            className={`h-full ${pct >= 100 ? "bg-accent" : pct >= 90 ? "bg-accent" : "bg-brand"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-muted">Candidate or spouse — self-funding limit applies</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/finance/contributions" className="mt-4 inline-block text-sm underline">
              All contributions
            </Link>
          </Card>

          <Card title="Filing">
            <p className="text-sm text-muted">
              The worksheet lays your books out in the order of the ministry&apos;s
              Form 4 so you can transcribe it line by line, and exports the
              itemised contributor list your auditor will ask for.
            </p>
            <Link href="/finance/form4" className="btn-primary mt-3 w-full">
              Open Form 4 worksheet
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
