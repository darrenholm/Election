"use client";

import { useMemo, useState } from "react";
import { createContribution } from "@/app/actions/finance";
import { CONTRIBUTION_METHOD_OPTIONS } from "@/lib/enums";
import { formatCents, parseCents } from "@/lib/money";
import {
  ANONYMOUS_LIMIT_CENTS,
  CASH_LIMIT_CENTS,
  CONTRIBUTION_LIMIT_CENTS,
  checkContribution,
  EXPENSE_CATEGORY_OPTIONS,
} from "@/lib/ontario";
import { Field, Select } from "@/components/ui";

export type ContributorOption = {
  id: string;
  name: string;
  totalCents: number;
  ontarioResident: boolean;
  isCandidate: boolean;
  isCandidateSpouse: boolean;
  hasAddress: boolean;
};

/**
 * Contribution entry with the Act's rules applied as you type. The same
 * checkContribution used by the standing audit runs here, so what the form
 * warns about at entry is exactly what the finance page will flag afterwards.
 */
export function ContributionForm({
  contributors,
  events,
  selfFundingLimitCents,
}: {
  contributors: ContributorOption[];
  events: { id: string; name: string }[];
  selfFundingLimitCents: number;
}) {
  const [contributorId, setContributorId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CHEQUE");
  const [isAnonymous, setAnonymous] = useState(false);
  const [isInKind, setInKind] = useState(false);
  const [issueReceipt, setIssueReceipt] = useState(true);

  const contributor = contributors.find((c) => c.id === contributorId) ?? null;
  const amountCents = parseCents(amount) ?? 0;

  const flags = useMemo(() => {
    if (amountCents <= 0) return [];
    return checkContribution({
      amountCents,
      method,
      isAnonymous,
      isInKind: isInKind || method === "IN_KIND",
      priorTotalCents: contributor?.totalCents ?? 0,
      hasReceipt: issueReceipt,
      selfFundingLimitCents,
      contributor: contributor
        ? {
            ontarioResident: contributor.ontarioResident,
            isCandidate: contributor.isCandidate,
            isCandidateSpouse: contributor.isCandidateSpouse,
            hasName: true,
            hasAddress: contributor.hasAddress,
          }
        : null,
    });
  }, [
    amountCents,
    method,
    isAnonymous,
    isInKind,
    issueReceipt,
    contributor,
    selfFundingLimitCents,
  ]);

  const ceiling =
    contributor?.isCandidate || contributor?.isCandidateSpouse
      ? selfFundingLimitCents
      : CONTRIBUTION_LIMIT_CENTS;
  const headroom = contributor ? ceiling - contributor.totalCents : null;

  return (
    <form
      action={async (formData) => {
        await createContribution(formData);
        setAmount("");
        setContributorId("");
      }}
      className="space-y-4"
    >
      <Field label="Contributor">
        <select
          name="contributorId"
          value={contributorId}
          onChange={(e) => setContributorId(e.target.value)}
          className="field"
        >
          <option value="">— none (anonymous, $25 or less) —</option>
          {contributors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.totalCents > 0 ? ` — ${formatCents(c.totalCents)} so far` : ""}
            </option>
          ))}
        </select>
      </Field>

      {headroom !== null ? (
        <p className="-mt-2 text-xs text-muted">
          {headroom > 0
            ? `${formatCents(headroom)} of room left before this contributor reaches their limit.`
            : "This contributor is at or over their limit."}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="$250.00"
            className="field"
            required
          />
        </Field>
        <Field label="Received">
          <input name="receivedAt" type="date" className="field" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Method">
          <select
            name="method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              if (e.target.value === "IN_KIND") setInKind(true);
            }}
            className="field"
          >
            {CONTRIBUTION_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {events.length > 0 ? (
          <Field label="Fundraising event">
            <Select
              name="eventId"
              options={events.map((e) => ({ value: e.id, label: e.name }))}
              includeBlank
              blankLabel="Not at an event"
            />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="isAnonymous"
            checked={isAnonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
          Anonymous
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="isInKind"
            checked={isInKind}
            onChange={(e) => setInKind(e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
          In kind
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="issueReceipt"
            checked={issueReceipt}
            onChange={(e) => setIssueReceipt(e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
          Issue a receipt
        </label>
      </div>

      {isInKind ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What was given" hint="Recorded at fair market value.">
            <input
              name="inKindDescription"
              className="field"
              placeholder="Printing of 2,000 flyers"
            />
          </Field>
          <Field label="Matching expense category">
            <Select
              name="inKindCategory"
              options={EXPENSE_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              defaultValue="OTHER_SUBJECT"
            />
          </Field>
        </div>
      ) : null}

      <Field label="Notes">
        <input name="notes" className="field" />
      </Field>

      {flags.length > 0 ? (
        <ul className="space-y-1.5">
          {flags.map((flag) => (
            <li
              key={flag.code}
              className={`rounded-lg border px-3 py-2 text-xs ${
                flag.level === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
                  : flag.level === "warning"
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    : "border-line bg-raise text-muted"
              }`}
            >
              {flag.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Limits: {formatCents(CONTRIBUTION_LIMIT_CENTS)} per contributor · cash
          only up to {formatCents(CASH_LIMIT_CENTS)} · anonymous only up to{" "}
          {formatCents(ANONYMOUS_LIMIT_CENTS)} at a fundraiser.
        </p>
      )}

      <button type="submit" className="btn-primary w-full">
        Record contribution
      </button>
    </form>
  );
}
