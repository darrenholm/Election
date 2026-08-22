import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCampaign } from "@/lib/campaign";
import { getFinanceSummary, getItemisedContributors } from "@/lib/finance";
import { csvAmount, csvDate, csvResponse, toCsv } from "@/lib/csv";
import { CONTRIBUTION_METHODS, label } from "@/lib/enums";
import { EXPENSE_CATEGORIES, expenseCategory } from "@/lib/ontario";

export const dynamic = "force-dynamic";

/**
 * CSV exports for the bookkeeper and the auditor. Every export is a flat table
 * with one row per record so it can be sorted and totalled in a spreadsheet
 * without unpicking a layout.
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "contributions";
  const campaign = await getCampaign();
  const slug = (campaign.candidateName || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  switch (type) {
    case "expenses":
      return exportExpenses(slug);
    case "form4":
      return exportForm4(slug);
    case "schedule1":
      return exportSchedule1(slug);
    case "contributions":
    default:
      return exportContributions(slug);
  }
}

async function exportContributions(slug: string) {
  const contributions = await db.contribution.findMany({
    include: { contributor: true, event: true },
    orderBy: { receivedAt: "asc" },
  });

  const body = toCsv(
    [
      "Received",
      "Last name",
      "First name",
      "Address",
      "City",
      "Postal code",
      "Amount",
      "Method",
      "In kind",
      "In-kind description",
      "Anonymous",
      "Receipt number",
      "Receipt issued",
      "Event",
      "Returned",
      "Return reason",
      "Notes",
    ],
    contributions.map((c) => [
      csvDate(c.receivedAt),
      c.contributor?.lastName ?? "",
      c.contributor?.firstName ?? (c.isAnonymous ? "Anonymous" : ""),
      c.contributor?.addressLine ?? "",
      c.contributor?.city ?? "",
      c.contributor?.postalCode ?? "",
      csvAmount(c.amountCents),
      label(CONTRIBUTION_METHODS, c.method),
      c.isInKind ? "Yes" : "No",
      c.inKindDescription,
      c.isAnonymous ? "Yes" : "No",
      c.receiptNumber,
      csvDate(c.receiptIssuedAt),
      c.event?.name ?? "",
      csvDate(c.returnedAt),
      c.returnReason,
      c.notes,
    ]),
  );

  return csvResponse(`${slug}-contributions.csv`, body);
}

async function exportExpenses(slug: string) {
  const expenses = await db.expense.findMany({
    include: { event: true },
    orderBy: { incurredAt: "asc" },
  });

  const body = toCsv(
    [
      "Incurred",
      "Paid",
      "Description",
      "Vendor",
      "Form 4 category",
      "Amount",
      "Subject to spending limit",
      "Appreciation-party expense",
      "In kind",
      "Payment method",
      "Invoice reference",
      "Event",
      "Notes",
    ],
    expenses.map((e) => [
      csvDate(e.incurredAt),
      csvDate(e.paidAt),
      e.description,
      e.vendor,
      expenseCategory(e.category).label,
      csvAmount(e.amountCents),
      e.subjectToLimit ? "Yes" : "No",
      e.isPartyExpense ? "Yes" : "No",
      e.isInKind ? "Yes" : "No",
      e.paymentMethod,
      e.invoiceRef,
      e.event?.name ?? "",
      e.notes,
    ]),
  );

  return csvResponse(`${slug}-expenses.csv`, body);
}

/** Box B, Box C and Box D as one label/amount table, ready to transcribe. */
async function exportForm4(slug: string) {
  const summary = await getFinanceSummary();

  const byCategory = new Map<string, number>();
  for (const expense of summary.expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }

  const rows: unknown[][] = [
    ["Box B", "Total contributions", csvAmount(summary.totalContributionsCents)],
    ["Box B", "— monetary", csvAmount(summary.monetaryCents)],
    ["Box B", "— in kind", csvAmount(summary.inKindCents)],
    ["Box B", "Expenses subject to the general limit", csvAmount(summary.subjectToLimitCents)],
    ["Box B", "Appreciation-party expenses", csvAmount(summary.partyExpenseCents)],
    ["Box B", "Expenses not subject to the general limit", csvAmount(summary.notSubjectToLimitCents)],
    ["Box B", "Total expenses", csvAmount(summary.totalExpensesCents)],
  ];

  for (const category of EXPENSE_CATEGORIES) {
    rows.push([
      category.subjectToLimit ? "Box C — subject to limit" : "Box C — not subject to limit",
      category.label,
      csvAmount(byCategory.get(category.key) ?? 0),
    ]);
  }

  rows.push([
    "Box D",
    summary.balanceCents >= 0 ? "Surplus" : "Deficit",
    csvAmount(Math.abs(summary.balanceCents)),
  ]);
  rows.push(["Limits", "General spending limit", csvAmount(summary.limits.spendingLimitCents)]);
  rows.push(["Limits", "Appreciation-party limit", csvAmount(summary.limits.partyExpenseLimitCents)]);
  rows.push(["Limits", "Self-funding limit", csvAmount(summary.limits.selfFundingLimitCents)]);

  return csvResponse(`${slug}-form4-worksheet.csv`, toCsv(["Section", "Line", "Amount"], rows));
}

/** Schedule 1, Part II — every contributor whose total exceeds $100. */
async function exportSchedule1(slug: string) {
  const itemised = await getItemisedContributors();

  const body = toCsv(
    ["Last name", "First name", "Address", "City", "Province", "Postal code", "Total", "Contributions"],
    itemised.map(({ contributor, totalCents, count }) => [
      contributor.lastName,
      contributor.firstName,
      contributor.addressLine,
      contributor.city,
      contributor.province,
      contributor.postalCode,
      csvAmount(totalCents),
      count,
    ]),
  );

  return csvResponse(`${slug}-schedule1-contributors.csv`, body);
}
