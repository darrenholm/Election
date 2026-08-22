import { db } from "./db";
import { getLimits } from "./campaign";
import { requireCampaignId } from "./campaign";
import {
  ITEMISATION_THRESHOLD_CENTS,
  checkContribution,
  expenseCategory,
  type ContributionFlag,
} from "./ontario";

/**
 * Everything the finance pages and the Form 4 worksheet need, computed in one
 * place so the dashboard, the compliance banner and the filing worksheet can
 * never disagree with each other.
 */
export type FinanceSummary = Awaited<ReturnType<typeof getFinanceSummary>>;

export async function getFinanceSummary() {
  const campaignId = await requireCampaignId();
  const [limitSet, contributions, expenses] = await Promise.all([
    getLimits(),
    db.contribution.findMany({
      where: { campaignId },
      include: { contributor: true, event: true },
      orderBy: { receivedAt: "desc" },
    }),
    db.expense.findMany({ where: { campaignId }, orderBy: { incurredAt: "desc" } }),
  ]);
  if (!limitSet) throw new Error("No campaign selected");
  const limits = limitSet;

  // Returned contributions are kept for the audit trail but must not count
  // toward totals or a contributor's running limit.
  const live = contributions.filter((c) => c.returnedAt === null);

  const monetaryCents = sum(live.filter((c) => !c.isInKind).map((c) => c.amountCents));
  const inKindCents = sum(live.filter((c) => c.isInKind).map((c) => c.amountCents));
  const totalContributionsCents = monetaryCents + inKindCents;

  const selfFundingCents = sum(
    live
      .filter((c) => c.contributor?.isCandidate || c.contributor?.isCandidateSpouse)
      .map((c) => c.amountCents),
  );

  const subjectToLimitCents = sum(
    expenses.filter((e) => e.subjectToLimit && !e.isPartyExpense).map((e) => e.amountCents),
  );
  const partyExpenseCents = sum(
    expenses.filter((e) => e.isPartyExpense).map((e) => e.amountCents),
  );
  const notSubjectToLimitCents = sum(
    expenses
      .filter((e) => !e.subjectToLimit && !e.isPartyExpense)
      .map((e) => e.amountCents),
  );
  const totalExpensesCents =
    subjectToLimitCents + partyExpenseCents + notSubjectToLimitCents;

  // Fundraising ticket revenue that was not recorded as a contribution is
  // reported separately on Form 4 as "revenue from fundraising events".
  const balanceCents = totalContributionsCents - totalExpensesCents;

  return {
    limits,
    contributions,
    expenses,
    monetaryCents,
    inKindCents,
    totalContributionsCents,
    selfFundingCents,
    subjectToLimitCents,
    partyExpenseCents,
    notSubjectToLimitCents,
    totalExpensesCents,
    balanceCents,
    spendingRemainingCents: limits.spendingLimitCents - subjectToLimitCents,
    partyRemainingCents: limits.partyExpenseLimitCents - partyExpenseCents,
    selfFundingRemainingCents: limits.selfFundingLimitCents - selfFundingCents,
  };
}

/** Running total per contributor, excluding returned contributions. */
export async function getContributorTotals(): Promise<Map<string, number>> {
  const campaignId = await requireCampaignId();
  const rows = await db.contribution.groupBy({
    by: ["contributorId"],
    where: { campaignId, returnedAt: null, contributorId: { not: null } },
    _sum: { amountCents: true },
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.contributorId) totals.set(row.contributorId, row._sum.amountCents ?? 0);
  }
  return totals;
}

export type FlaggedContribution = {
  id: string;
  amountCents: number;
  receivedAt: Date;
  contributorName: string;
  contributorId: string | null;
  flags: ContributionFlag[];
};

/**
 * Re-run the Act's rules over every recorded contribution. This is the
 * campaign's standing compliance check: it is cheap enough to run on every
 * finance page load and catches problems introduced by later edits, not just
 * at the moment of entry.
 */
export async function auditContributions(): Promise<FlaggedContribution[]> {
  const campaignId = await requireCampaignId();
  const [limitSet, contributions] = await Promise.all([
    getLimits(),
    db.contribution.findMany({
      where: { campaignId, returnedAt: null },
      include: { contributor: true },
      orderBy: { receivedAt: "asc" },
    }),
  ]);
  if (!limitSet) return [];
  const limits = limitSet;

  // Walk chronologically so "prior total" means what it meant on the day.
  const running = new Map<string, number>();
  const flagged: FlaggedContribution[] = [];

  for (const c of contributions) {
    const key = c.contributorId ?? `anon:${c.id}`;
    const prior = running.get(key) ?? 0;

    const flags = checkContribution({
      amountCents: c.amountCents,
      method: c.method,
      isAnonymous: c.isAnonymous,
      isInKind: c.isInKind,
      priorTotalCents: prior,
      hasReceipt: c.receiptIssuedAt !== null || c.receiptNumber.trim() !== "",
      selfFundingLimitCents: limits.selfFundingLimitCents,
      contributor: c.contributor
        ? {
            ontarioResident: c.contributor.ontarioResident,
            isCandidate: c.contributor.isCandidate,
            isCandidateSpouse: c.contributor.isCandidateSpouse,
            hasName: c.contributor.firstName.trim() !== "",
            hasAddress:
              c.contributor.addressLine.trim() !== "" && c.contributor.city.trim() !== "",
          }
        : null,
    });

    running.set(key, prior + c.amountCents);

    const actionable = flags.filter((f) => f.level !== "info");
    if (actionable.length > 0) {
      flagged.push({
        id: c.id,
        amountCents: c.amountCents,
        receivedAt: c.receivedAt,
        contributorId: c.contributorId,
        contributorName: c.contributor
          ? `${c.contributor.firstName} ${c.contributor.lastName}`.trim()
          : c.isAnonymous
            ? "Anonymous"
            : "— no contributor —",
        flags: actionable,
      });
    }
  }

  return flagged;
}

/** Form 4, Box C — expense totals grouped by the ministry's own line items. */
export async function getExpensesByCategory() {
  const campaignId = await requireCampaignId();
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: { campaignId },
    _sum: { amountCents: true },
    _count: true,
  });

  return rows
    .map((r) => ({
      category: expenseCategory(r.category),
      totalCents: r._sum.amountCents ?? 0,
      count: r._count,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Form 4, Schedule 1, Part II — contributors whose total exceeds $100, which
 * must be itemised by name and address in the filed statement.
 */
export async function getItemisedContributors() {
  const campaignId = await requireCampaignId();
  const contributors = await db.contributor.findMany({
    where: { campaignId },
    include: { contributions: { where: { returnedAt: null } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return contributors
    .map((c) => ({
      contributor: c,
      totalCents: sum(c.contributions.map((x) => x.amountCents)),
      count: c.contributions.length,
    }))
    .filter((c) => c.totalCents > ITEMISATION_THRESHOLD_CENTS)
    .sort((a, b) => b.totalCents - a.totalCents);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
