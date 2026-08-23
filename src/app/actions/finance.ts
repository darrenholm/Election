"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CONTRIBUTION_METHODS } from "@/lib/enums";
import { expenseCategory } from "@/lib/ontario";
import { bool, cents, date, str, strOrNull } from "@/lib/form";
import { requireCampaignId } from "@/lib/campaign";
import { requireCampaign, requireOwned } from "@/lib/guard";

function refreshFinance(extra?: string) {
  revalidatePath("/finance");
  revalidatePath("/finance/contributions");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/form4");
  revalidatePath("/");
  if (extra) revalidatePath(extra);
}

/* ------------------------------------------------------------ contributors */

function contributorFields(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    addressLine: str(formData, "addressLine"),
    city: str(formData, "city"),
    province: str(formData, "province") || "ON",
    postalCode: str(formData, "postalCode"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    // Only individuals normally resident in Ontario may contribute; the flag is
    // opt-out so a blank form does not silently record an ineligible donor as
    // eligible without anyone looking at it.
    ontarioResident: bool(formData, "ontarioResident"),
    isCandidate: bool(formData, "isCandidate"),
    isCandidateSpouse: bool(formData, "isCandidateSpouse"),
    notes: str(formData, "notes"),
  };
}

export async function createContributor(formData: FormData) {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;
  const contributor = await db.contributor.create({
    data: { ...contributorFields(formData), campaignId },
  });
  refreshFinance();
  redirect(`/finance/contributors/${contributor.id}`);
}

export async function updateContributor(contributorId: string, formData: FormData) {
  if (!(await requireOwned("contributor", contributorId, "MANAGER"))) return;

  await db.contributor.update({
    where: { id: contributorId },
    data: contributorFields(formData),
  });
  refreshFinance(`/finance/contributors/${contributorId}`);
}

export async function deleteContributor(contributorId: string) {
  if (!(await requireOwned("contributor", contributorId, "MANAGER"))) return;

  // Contributions survive with a null contributor rather than vanishing, so the
  // money still shows up in the totals and nothing quietly leaves the books.
  await db.contributor.delete({ where: { id: contributorId } });
  refreshFinance();
  redirect("/finance/contributions");
}

/* ----------------------------------------------------------- contributions */

/**
 * Receipts must be issued for every contribution, and the Act expects them to
 * be traceable. Numbers are sequential per campaign: R-0001, R-0002, …
 */
async function nextReceiptNumber(campaignId: string): Promise<string> {
  // Numbered per campaign: each candidate files their own Form 4 and needs its
  // receipts to run from one.
  const count = await db.contribution.count({ where: { campaignId } });
  return `R-${String(count + 1).padStart(4, "0")}`;
}

export async function createContribution(formData: FormData) {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;

  const method = str(formData, "method") in CONTRIBUTION_METHODS
    ? str(formData, "method")
    : "CHEQUE";
  const isInKind = bool(formData, "isInKind") || method === "IN_KIND";

  const contribution = await db.contribution.create({
    data: {
      campaignId,
      contributorId: strOrNull(formData, "contributorId"),
      amountCents: cents(formData, "amount"),
      receivedAt: date(formData, "receivedAt") ?? new Date(),
      method,
      isInKind,
      inKindDescription: str(formData, "inKindDescription"),
      isAnonymous: bool(formData, "isAnonymous"),
      receiptNumber: bool(formData, "issueReceipt") ? await nextReceiptNumber(campaignId) : "",
      receiptIssuedAt: bool(formData, "issueReceipt") ? new Date() : null,
      eventId: strOrNull(formData, "eventId"),
      notes: str(formData, "notes"),
    },
  });

  // An in-kind contribution is also an expense: the Act counts the fair market
  // value on both sides of the ledger, so record the matching expense here
  // rather than trusting anyone to remember it at filing time.
  if (isInKind && contribution.amountCents > 0) {
    await db.expense.create({
      data: {
        campaignId,
        description:
          str(formData, "inKindDescription") || "In-kind contribution (goods or services)",
        vendor: "",
        category: str(formData, "inKindCategory") || "OTHER_SUBJECT",
        amountCents: contribution.amountCents,
        incurredAt: contribution.receivedAt,
        subjectToLimit: expenseCategory(str(formData, "inKindCategory") || "OTHER_SUBJECT")
          .subjectToLimit,
        isInKind: true,
        eventId: contribution.eventId,
        notes: "Created automatically from an in-kind contribution.",
      },
    });
  }

  refreshFinance();
}

export async function issueReceipt(contributionId: string) {
  if (!(await requireOwned("contribution", contributionId, "MANAGER"))) return;

  const existing = await db.contribution.findUnique({ where: { id: contributionId } });
  if (!existing || existing.receiptNumber) return;

  await db.contribution.update({
    where: { id: contributionId },
    data: {
      receiptNumber: await nextReceiptNumber(existing.campaignId),
      receiptIssuedAt: new Date(),
    },
  });
  refreshFinance();
}

/**
 * Return a contribution that should not have been accepted — over the limit,
 * from an ineligible contributor, or anonymous above $25. The row stays on the
 * books, marked returned, because the audit trail matters more than a tidy
 * ledger.
 */
export async function returnContribution(contributionId: string, formData: FormData) {
  if (!(await requireOwned("contribution", contributionId, "MANAGER"))) return;

  await db.contribution.update({
    where: { id: contributionId },
    data: {
      returnedAt: date(formData, "returnedAt") ?? new Date(),
      returnReason: str(formData, "returnReason") || "Returned to contributor.",
    },
  });
  refreshFinance();
}

export async function undoReturn(contributionId: string) {
  if (!(await requireOwned("contribution", contributionId, "MANAGER"))) return;

  await db.contribution.update({
    where: { id: contributionId },
    data: { returnedAt: null, returnReason: "" },
  });
  refreshFinance();
}

export async function deleteContribution(contributionId: string) {
  if (!(await requireOwned("contribution", contributionId, "MANAGER"))) return;

  await db.contribution.delete({ where: { id: contributionId } });
  refreshFinance();
}

/* ---------------------------------------------------------------- expenses */

export async function createExpense(formData: FormData) {
  const campaignId = await requireCampaignId();
  if (!(await requireCampaign(campaignId, "MANAGER"))) return;
  const categoryKey = str(formData, "category") || "OTHER_SUBJECT";
  const category = expenseCategory(categoryKey);

  await db.expense.create({
    data: {
      campaignId,
      description: str(formData, "description") || "Untitled expense",
      vendor: str(formData, "vendor"),
      category: categoryKey,
      amountCents: cents(formData, "amount"),
      incurredAt: date(formData, "incurredAt") ?? new Date(),
      paidAt: date(formData, "paidAt"),
      paymentMethod: str(formData, "paymentMethod"),
      invoiceRef: str(formData, "invoiceRef"),
      // The category decides by default; the checkbox lets a bookkeeper
      // override for the odd line the ministry form treats differently.
      subjectToLimit: formData.has("subjectToLimit")
        ? bool(formData, "subjectToLimit")
        : category.subjectToLimit,
      isPartyExpense: category.partyExpense === true,
      eventId: strOrNull(formData, "eventId"),
      notes: str(formData, "notes"),
    },
  });

  refreshFinance();
}

export async function updateExpense(expenseId: string, formData: FormData) {
  if (!(await requireOwned("expense", expenseId, "MANAGER"))) return;

  const categoryKey = str(formData, "category") || "OTHER_SUBJECT";
  const category = expenseCategory(categoryKey);

  await db.expense.update({
    where: { id: expenseId },
    data: {
      description: str(formData, "description"),
      vendor: str(formData, "vendor"),
      category: categoryKey,
      amountCents: cents(formData, "amount"),
      incurredAt: date(formData, "incurredAt") ?? new Date(),
      paidAt: date(formData, "paidAt"),
      paymentMethod: str(formData, "paymentMethod"),
      invoiceRef: str(formData, "invoiceRef"),
      subjectToLimit: bool(formData, "subjectToLimit"),
      isPartyExpense: category.partyExpense === true,
      notes: str(formData, "notes"),
    },
  });

  refreshFinance();
}

export async function deleteExpense(expenseId: string) {
  if (!(await requireOwned("expense", expenseId, "MANAGER"))) return;

  await db.expense.delete({ where: { id: expenseId } });
  refreshFinance();
}
