import Link from "next/link";
import { db } from "@/lib/db";
import { getFinanceSummary } from "@/lib/finance";
import { EXPENSE_CATEGORIES, expenseCategory } from "@/lib/ontario";
import { formatCents } from "@/lib/money";
import { formatDate, toDateInput } from "@/lib/dates";
import { createExpense, deleteExpense, updateExpense } from "@/app/actions/finance";
import { Badge, Card, EmptyState, Field, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

const SUBJECT = EXPENSE_CATEGORIES.filter((c) => c.subjectToLimit);
const NOT_SUBJECT = EXPENSE_CATEGORIES.filter((c) => !c.subjectToLimit);

export default async function ExpensesPage() {
  const [summary, expenses, events] = await Promise.all([
    getFinanceSummary(),
    db.expense.findMany({ include: { event: true }, orderBy: { incurredAt: "desc" }, take: 300 }),
    db.event.findMany({ orderBy: { startsAt: "desc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Categories follow the ministry's Form 4 so your books transcribe straight onto the filing."
        actions={
          <Link href="/finance/export?type=expenses" className="btn-secondary">
            Export CSV
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Subject to limit"
          value={formatCents(summary.subjectToLimitCents)}
          hint={`${formatCents(Math.max(0, summary.spendingRemainingCents))} left`}
          tone={summary.spendingRemainingCents < 0 ? "bad" : "neutral"}
        />
        <StatTile label="Not subject to limit" value={formatCents(summary.notSubjectToLimitCents)} />
        <StatTile
          label="Appreciation party"
          value={formatCents(summary.partyExpenseCents)}
          hint={`limit ${formatCents(summary.limits.partyExpenseLimitCents)}`}
          tone={summary.partyRemainingCents < 0 ? "bad" : "neutral"}
        />
        <StatTile label="Total spent" value={formatCents(summary.totalExpensesCents)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Ledger">
            {expenses.length === 0 ? (
              <EmptyState
                title="No expenses recorded"
                hint="Log every campaign expense — the nomination fee, signs, printing, phone bills."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Description</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Incurred</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const category = expenseCategory(e.category);
                    const save = updateExpense.bind(null, e.id);
                    const remove = deleteExpense.bind(null, e.id);
                    return (
                      <tr key={e.id}>
                        <Td>
                          <p className="font-medium">{e.description}</p>
                          {e.vendor ? <p className="text-xs text-muted">{e.vendor}</p> : null}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {e.isInKind ? <Badge tone="brand">In kind</Badge> : null}
                            {e.isPartyExpense ? <Badge tone="warn">Party limit</Badge> : null}
                            {!e.subjectToLimit && !e.isPartyExpense ? (
                              <Badge>Outside the limit</Badge>
                            ) : null}
                            {e.event ? <Badge>{e.event.name}</Badge> : null}
                          </div>
                        </Td>
                        <Td className="text-muted">{category.label}</Td>
                        <Td className="text-right tabular-nums font-medium">
                          {formatCents(e.amountCents)}
                        </Td>
                        <Td className="text-muted">{formatDate(e.incurredAt)}</Td>
                        <Td>
                          <details>
                            <summary className="cursor-pointer text-xs text-muted">Edit</summary>
                            <form action={save} className="mt-2 w-64 space-y-2">
                              <input
                                name="description"
                                defaultValue={e.description}
                                className="field text-xs"
                              />
                              <input
                                name="vendor"
                                defaultValue={e.vendor}
                                placeholder="Vendor"
                                className="field text-xs"
                              />
                              <input
                                name="amount"
                                defaultValue={(e.amountCents / 100).toFixed(2)}
                                className="field text-xs"
                              />
                              <CategorySelect defaultValue={e.category} className="text-xs" />
                              <input
                                name="incurredAt"
                                type="date"
                                defaultValue={toDateInput(e.incurredAt)}
                                className="field text-xs"
                              />
                              <input
                                name="paidAt"
                                type="date"
                                defaultValue={toDateInput(e.paidAt)}
                                className="field text-xs"
                              />
                              <input
                                name="invoiceRef"
                                defaultValue={e.invoiceRef}
                                placeholder="Invoice ref"
                                className="field text-xs"
                              />
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  name="subjectToLimit"
                                  defaultChecked={e.subjectToLimit}
                                  className="size-4 accent-[var(--color-brand)]"
                                />
                                Counts against the spending limit
                              </label>
                              <textarea
                                name="notes"
                                defaultValue={e.notes}
                                rows={2}
                                className="field text-xs"
                              />
                              <button type="submit" className="btn-primary w-full text-xs">
                                Save
                              </button>
                            </form>
                          </details>
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

        <Card title="Record an expense">
          <form action={createExpense} className="space-y-3">
            <Field label="Description">
              <input name="description" className="field" placeholder="500 lawn signs" required />
            </Field>
            <Field label="Vendor">
              <input name="vendor" className="field" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount">
                <input name="amount" inputMode="decimal" placeholder="$0.00" className="field" required />
              </Field>
              <Field label="Incurred">
                <input name="incurredAt" type="date" className="field" />
              </Field>
            </div>
            <Field
              label="Category"
              hint="The category decides whether the expense counts against the spending limit."
            >
              <CategorySelect defaultValue="SIGNS" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Paid">
                <input name="paidAt" type="date" className="field" />
              </Field>
              <Field label="Payment method">
                <input name="paymentMethod" className="field" placeholder="Cheque #104" />
              </Field>
            </div>
            <Field label="Invoice reference">
              <input name="invoiceRef" className="field" />
            </Field>
            {events.length > 0 ? (
              <Field label="Related event">
                <select name="eventId" className="field">
                  <option value="">Not tied to an event</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Notes">
              <textarea name="notes" rows={2} className="field" />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Record expense
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}

/** Grouped exactly as Form 4 Box C splits the two halves of the expense list. */
function CategorySelect({
  defaultValue,
  className = "",
}: {
  defaultValue: string;
  className?: string;
}) {
  return (
    <select name="category" defaultValue={defaultValue} className={`field ${className}`}>
      <optgroup label="Subject to spending limit">
        {SUBJECT.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Not subject to spending limit">
        {NOT_SUBJECT.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
