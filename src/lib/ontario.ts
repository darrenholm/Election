/**
 * Ontario Municipal Elections Act, 1996 — campaign finance rules.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BOOKKEEPING AID, NOT LEGAL OR ACCOUNTING ADVICE.
 *
 * The clerk of the municipality issues the certified spending limit, and the
 * candidate's own filed Form 4 (with an auditor's report where one is required)
 * is what governs. Every figure this module computes is an *estimate* to keep
 * the campaign inside the lines day to day. Enter the clerk's certified numbers
 * in Settings as soon as you receive them — they override these estimates
 * everywhere in the app.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rules encoded here, with the section of the Act they come from:
 *
 *  - s. 88.9.1  A contributor may give at most $1,200 to any one candidate, and
 *               at most $5,000 in total to candidates for office on the same
 *               council or local board. The app can only see its own campaign,
 *               so the $5,000 cap is shown as a note, never enforced.
 *  - s. 88.9.2  The candidate and their spouse may exceed $1,200 when funding
 *               their own campaign, up to a formula limit capped at $25,000.
 *  - s. 88.9    Only individuals normally resident in Ontario may contribute.
 *               Corporations and trade unions have been prohibited since 2018.
 *               Contributions over $25 must not be in cash, and every
 *               contribution requires a receipt. Amounts of $25 or less taken
 *               at a fundraising function may be recorded anonymously.
 *  - s. 88.20   General spending limit: a base amount plus $0.85 per eligible
 *               elector for the office.
 *  - s. 88.21   Parties and other expressions of appreciation held after voting
 *               day carry a separate limit of 10% of the general limit.
 */

import type { Office } from "./enums";

/* ------------------------------------------------------------ contributions */

/** s. 88.9.1 — maximum from one contributor to this campaign. */
export const CONTRIBUTION_LIMIT_CENTS = 120_000; // $1,200

/** s. 88.9.1 — aggregate cap across all candidates for the same council. */
export const CONTRIBUTION_LIMIT_SAME_COUNCIL_CENTS = 500_000; // $5,000

/** At or below this, a contribution taken at a fundraiser may be anonymous. */
export const ANONYMOUS_LIMIT_CENTS = 2_500; // $25

/** Above this, a contribution must not be made in cash. */
export const CASH_LIMIT_CENTS = 2_500; // $25

/** Contributors above this amount must be itemised on Form 4, Schedule 1. */
export const ITEMISATION_THRESHOLD_CENTS = 10_000; // over $100

/* -------------------------------------------------------------------- limits */

const SPENDING_BASE_CENTS: Record<Office, number> = {
  HEAD_OF_COUNCIL: 750_000, // $7,500
  COUNCILLOR: 500_000, // $5,000
  SCHOOL_TRUSTEE: 500_000,
  OTHER: 500_000,
};

const SELF_FUNDING_BASE_CENTS: Record<Office, number> = {
  HEAD_OF_COUNCIL: 750_000, // $7,500
  COUNCILLOR: 500_000, // $5,000
  SCHOOL_TRUSTEE: 500_000,
  OTHER: 500_000,
};

/** s. 88.20 — $0.85 per eligible elector. */
const SPENDING_PER_ELECTOR_CENTS = 85;

/** s. 88.9.2 — $0.20 per eligible elector. */
const SELF_FUNDING_PER_ELECTOR_CENTS = 20;

/** s. 88.9.2 — hard ceiling on candidate + spouse self-funding. */
const SELF_FUNDING_MAX_CENTS = 2_500_000; // $25,000

/** s. 88.21 — appreciation-party limit as a fraction of the general limit. */
const PARTY_EXPENSE_FRACTION = 0.1;

export type LimitSet = {
  /** General spending limit for expenses subject to the limit. */
  spendingLimitCents: number;
  /** Separate limit for post-voting-day parties and expressions of appreciation. */
  partyExpenseLimitCents: number;
  /** Combined candidate-and-spouse self-funding ceiling. */
  selfFundingLimitCents: number;
  /** True when the figures come from the clerk rather than the formula. */
  certified: {
    spending: boolean;
    partyExpense: boolean;
    selfFunding: boolean;
  };
};

export type LimitInputs = {
  office: string;
  electorCount: number;
  certifiedSpendingLimitCents?: number | null;
  certifiedPartyExpenseLimitCents?: number | null;
  certifiedSelfFundingLimitCents?: number | null;
};

function asOffice(office: string): Office {
  return office in SPENDING_BASE_CENTS ? (office as Office) : "OTHER";
}

/**
 * Resolve the three limits that bound an Ontario municipal campaign, preferring
 * the clerk's certified figures and falling back to the statutory formulas.
 */
export function computeLimits(input: LimitInputs): LimitSet {
  const office = asOffice(input.office);
  const electors = Math.max(0, Math.floor(input.electorCount || 0));

  const formulaSpending =
    SPENDING_BASE_CENTS[office] + electors * SPENDING_PER_ELECTOR_CENTS;

  const spendingLimitCents = input.certifiedSpendingLimitCents ?? formulaSpending;

  const partyExpenseLimitCents =
    input.certifiedPartyExpenseLimitCents ??
    Math.round(spendingLimitCents * PARTY_EXPENSE_FRACTION);

  const formulaSelfFunding = Math.min(
    SELF_FUNDING_BASE_CENTS[office] + electors * SELF_FUNDING_PER_ELECTOR_CENTS,
    SELF_FUNDING_MAX_CENTS,
  );

  const selfFundingLimitCents =
    input.certifiedSelfFundingLimitCents ?? formulaSelfFunding;

  return {
    spendingLimitCents,
    partyExpenseLimitCents,
    selfFundingLimitCents,
    certified: {
      spending: input.certifiedSpendingLimitCents != null,
      partyExpense: input.certifiedPartyExpenseLimitCents != null,
      selfFunding: input.certifiedSelfFundingLimitCents != null,
    },
  };
}

/** Plain-language description of how a limit was arrived at, for the UI. */
export function describeSpendingFormula(office: string, electorCount: number): string {
  const o = asOffice(office);
  const base = SPENDING_BASE_CENTS[o] / 100;
  return `$${base.toLocaleString("en-CA")} + $0.85 × ${electorCount.toLocaleString(
    "en-CA",
  )} electors`;
}

export function describeSelfFundingFormula(office: string, electorCount: number): string {
  const o = asOffice(office);
  const base = SELF_FUNDING_BASE_CENTS[o] / 100;
  return `$${base.toLocaleString("en-CA")} + $0.20 × ${electorCount.toLocaleString(
    "en-CA",
  )} electors, capped at $25,000`;
}

/* --------------------------------------------------- Form 4 expense taxonomy */

export type ExpenseCategory = {
  key: string;
  label: string;
  /** Whether this line sits above or below the spending limit on Form 4, Box C. */
  subjectToLimit: boolean;
  /** Post-voting-day appreciation expenses, which have their own 10% limit. */
  partyExpense?: boolean;
  note?: string;
};

/**
 * Form 4 (Financial Statement — Auditor's Report, Candidate), Box C. The order
 * and wording follow the ministry form so the worksheet can be transcribed line
 * by line at filing time.
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  // Box C1 — expenses subject to the general spending limit.
  {
    key: "INVENTORY_PRIOR_CAMPAIGN",
    label: "Inventory from previous campaign used in this campaign",
    subjectToLimit: true,
    note: "Valued at fair market value at the time it is used.",
  },
  { key: "ADVERTISING", label: "Advertising", subjectToLimit: true },
  { key: "BROCHURES", label: "Brochures / flyers", subjectToLimit: true },
  { key: "SIGNS", label: "Signs (including sign deposit)", subjectToLimit: true },
  { key: "MEETINGS_HOSTED", label: "Meetings hosted", subjectToLimit: true },
  {
    key: "OFFICE_BEFORE",
    label: "Office expenses incurred until voting day",
    subjectToLimit: true,
  },
  {
    key: "PHONE_BEFORE",
    label: "Phone and/or internet expenses incurred until voting day",
    subjectToLimit: true,
  },
  {
    key: "SALARIES_BEFORE",
    label: "Salaries, benefits, honoraria, professional fees until voting day",
    subjectToLimit: true,
  },
  {
    key: "BANK_BEFORE",
    label: "Bank charges incurred until voting day",
    subjectToLimit: true,
  },
  {
    key: "INTEREST_BEFORE",
    label: "Interest charged on loan until voting day",
    subjectToLimit: true,
  },
  { key: "OTHER_SUBJECT", label: "Other — subject to limit", subjectToLimit: true },

  // Box C2 — expenses not subject to the general spending limit.
  { key: "ACCOUNTING_AUDIT", label: "Accounting and audit", subjectToLimit: false },
  {
    key: "FUNDRAISING_COSTS",
    label: "Cost of fundraising events and activities",
    subjectToLimit: false,
    note: "Excluded from the general limit; report on Schedule 2.",
  },
  {
    key: "APPRECIATION_PARTY",
    label: "Voting day party or other expression of appreciation",
    subjectToLimit: false,
    partyExpense: true,
    note: "Carries its own limit of 10% of the general spending limit.",
  },
  {
    key: "OFFICE_AFTER",
    label: "Office expenses incurred after voting day",
    subjectToLimit: false,
  },
  {
    key: "PHONE_AFTER",
    label: "Phone and/or internet expenses incurred after voting day",
    subjectToLimit: false,
  },
  {
    key: "SALARIES_AFTER",
    label: "Salaries, benefits, honoraria, professional fees after voting day",
    subjectToLimit: false,
  },
  {
    key: "BANK_AFTER",
    label: "Bank charges incurred after voting day",
    subjectToLimit: false,
  },
  {
    key: "INTEREST_AFTER",
    label: "Interest charged on loan after voting day",
    subjectToLimit: false,
  },
  { key: "RECOUNT", label: "Expenses related to a recount", subjectToLimit: false },
  {
    key: "CONTROVERTED",
    label: "Expenses related to a controverted election",
    subjectToLimit: false,
  },
  {
    key: "COMPLIANCE_AUDIT",
    label: "Expenses related to a compliance audit",
    subjectToLimit: false,
  },
  {
    key: "DISABILITY",
    label: "Expenses related to a candidate's disability",
    subjectToLimit: false,
  },
  { key: "NOMINATION_FEE", label: "Nomination filing fee", subjectToLimit: false },
  { key: "OTHER_NOT_SUBJECT", label: "Other — not subject to limit", subjectToLimit: false },
];

const CATEGORY_BY_KEY = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, c]));

export function expenseCategory(key: string): ExpenseCategory {
  return (
    CATEGORY_BY_KEY.get(key) ?? {
      key,
      label: key,
      subjectToLimit: true,
    }
  );
}

export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({
  value: c.key,
  label: c.label,
  group: c.subjectToLimit ? "Subject to spending limit" : "Not subject to spending limit",
}));

/* -------------------------------------------------- contribution validation */

export type ContributionFlag = {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
};

export type ContributionCheckInput = {
  amountCents: number;
  method: string;
  isAnonymous: boolean;
  isInKind: boolean;
  /** Total this contributor has already given, excluding the row being checked. */
  priorTotalCents: number;
  contributor?: {
    ontarioResident: boolean;
    isCandidate: boolean;
    isCandidateSpouse: boolean;
    hasName: boolean;
    hasAddress: boolean;
  } | null;
  /** Self-funding ceiling, needed when the contributor is the candidate or spouse. */
  selfFundingLimitCents: number;
  /** True once a receipt has been issued for this contribution. */
  hasReceipt: boolean;
};

/**
 * Run one contribution against the Act's rules. Returns every problem found
 * rather than stopping at the first, so a data-entry volunteer sees the whole
 * picture at once. Errors mean the contribution as recorded is not lawful and
 * likely has to be returned; warnings mean a bookkeeping obligation is
 * outstanding.
 */
export function checkContribution(input: ContributionCheckInput): ContributionFlag[] {
  const flags: ContributionFlag[] = [];
  const { amountCents, contributor } = input;
  const isSelfFunding =
    contributor?.isCandidate === true || contributor?.isCandidateSpouse === true;

  if (amountCents <= 0) {
    flags.push({
      level: "error",
      code: "NON_POSITIVE",
      message: "A contribution must be greater than zero.",
    });
  }

  // Eligibility. Corporations and unions have been barred since 2018, and the
  // contributor must be normally resident in Ontario.
  if (contributor && !contributor.ontarioResident) {
    flags.push({
      level: "error",
      code: "NOT_ELIGIBLE",
      message:
        "Only individuals normally resident in Ontario may contribute. This contribution must be returned.",
    });
  }

  // Limits.
  const runningTotal = input.priorTotalCents + amountCents;
  if (isSelfFunding) {
    if (runningTotal > input.selfFundingLimitCents) {
      flags.push({
        level: "error",
        code: "OVER_SELF_FUNDING_LIMIT",
        message: `Candidate and spouse self-funding would reach ${fmt(
          runningTotal,
        )}, over the ${fmt(input.selfFundingLimitCents)} limit.`,
      });
    }
  } else if (runningTotal > CONTRIBUTION_LIMIT_CENTS) {
    flags.push({
      level: "error",
      code: "OVER_LIMIT",
      message: `This contributor would reach ${fmt(runningTotal)}, over the ${fmt(
        CONTRIBUTION_LIMIT_CENTS,
      )} per-candidate limit. Return the excess.`,
    });
  } else if (runningTotal === CONTRIBUTION_LIMIT_CENTS) {
    flags.push({
      level: "info",
      code: "AT_LIMIT",
      message: "This contributor is now at the $1,200 limit and cannot give again.",
    });
  } else if (runningTotal > CONTRIBUTION_LIMIT_CENTS * 0.9) {
    flags.push({
      level: "info",
      code: "NEAR_LIMIT",
      message: `Within ${fmt(
        CONTRIBUTION_LIMIT_CENTS - runningTotal,
      )} of the $1,200 limit for this contributor.`,
    });
  }

  // Cash rule.
  if (input.method === "CASH" && amountCents > CASH_LIMIT_CENTS) {
    flags.push({
      level: "error",
      code: "CASH_OVER_25",
      message:
        "Contributions over $25 must not be made in cash. Record a cheque, e-transfer, card or other traceable method.",
    });
  }

  // Anonymity.
  if (input.isAnonymous && amountCents > ANONYMOUS_LIMIT_CENTS) {
    flags.push({
      level: "error",
      code: "ANONYMOUS_OVER_25",
      message:
        "Only contributions of $25 or less taken at a fundraising function may be anonymous. Identify this contributor or return the money.",
    });
  }

  if (!input.isAnonymous && !contributor) {
    flags.push({
      level: "error",
      code: "NO_CONTRIBUTOR",
      message: "Attach a contributor, or mark the contribution anonymous if $25 or less.",
    });
  }

  // Record keeping for the itemised list on Schedule 1.
  if (
    contributor &&
    amountCents + input.priorTotalCents > ITEMISATION_THRESHOLD_CENTS &&
    !contributor.hasAddress
  ) {
    flags.push({
      level: "warning",
      code: "MISSING_ADDRESS",
      message:
        "Contributors over $100 in total must be listed with an address on Form 4, Schedule 1.",
    });
  }

  if (contributor && !contributor.hasName) {
    flags.push({
      level: "warning",
      code: "MISSING_NAME",
      message: "Record the contributor's full name.",
    });
  }

  // Receipts are required for every contribution, whatever the amount.
  if (!input.hasReceipt && !input.isAnonymous) {
    flags.push({
      level: "warning",
      code: "NO_RECEIPT",
      message: "A receipt must be issued for every contribution.",
    });
  }

  if (input.isInKind) {
    flags.push({
      level: "info",
      code: "IN_KIND",
      message:
        "In-kind contributions count at fair market value both as a contribution and as an expense.",
    });
  }

  return flags;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Short disclaimer rendered anywhere the app shows a compliance figure. */
export const COMPLIANCE_DISCLAIMER =
  "Estimates to help you stay inside the lines — not legal or accounting advice. The clerk's certified limits and your filed Form 4 govern.";
