/**
 * What the law expects of a sign once it is in the ground.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A PLANNING AID, NOT LEGAL ADVICE.
 *
 * Election sign rules are municipal. Every town writes its own by-law, and they
 * differ on setbacks, on how long before voting day a sign may go up, and on
 * how quickly it must come down afterwards. The figures here are the common
 * Ontario pattern, used so the app can put a date on a run sheet — they are not
 * a substitute for the by-law itself. Enter the local deadline in Settings if
 * it differs, and read the by-law before the first sign goes out.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The one rule that is not municipal: signs on a provincial highway right-of-way
 * answer to the Ministry of Transportation, not the town. MTO permits them on
 * Class 2B, 3 and 4 highways once an election is called, prohibits them outright
 * on freeways and principal arterials (the 400-series, Highway 11, Highway 69),
 * and gives campaigns three working days after voting day to retrieve them
 * before the Ministry collects and, two weeks later, destroys them.
 */

import type { SignPlacement } from "./enums";

/* ------------------------------------------------------------- deadlines --- */

/**
 * Hours after the close of voting day by which a sign must be gone.
 *
 * The municipal figures are the common by-law range — 48 to 72 hours — taken at
 * the tighter end, because a campaign that plans to the generous end of a range
 * it has not actually read is a campaign that gets a letter.
 */
const REMOVAL_HOURS: Record<SignPlacement, number> = {
  PRIVATE_LAWN: 72,
  PRIVATE_COMMERCIAL: 72,
  MUNICIPAL_ROW: 48,
  // Not used — MTO counts working days, see removalDueAt below.
  MTO_HIGHWAY: 72,
  OTHER_PUBLIC: 48,
};

/** MTO allows three *working* days, so weekends do not count against it. */
const MTO_WORKING_DAYS = 3;

function addWorkingDays(from: Date, days: number): Date {
  const out = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    const day = out.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return out;
}

/**
 * When this sign has to be down.
 *
 * Counted from the end of voting day rather than from the moment of install —
 * every deadline in the by-laws runs from the close of the poll, not from when
 * the crew happened to put the sign up.
 */
export function removalDueAt(votingDay: Date, placement: SignPlacement): Date {
  // End of voting day, local time: the poll closes on the day itself, and every
  // deadline starts counting from there.
  const closeOfPoll = new Date(votingDay);
  closeOfPoll.setHours(23, 59, 59, 999);

  if (placement === "MTO_HIGHWAY") {
    const due = addWorkingDays(closeOfPoll, MTO_WORKING_DAYS);
    due.setHours(23, 59, 59, 999);
    return due;
  }

  const due = new Date(closeOfPoll);
  due.setHours(due.getHours() + REMOVAL_HOURS[placement]);
  return due;
}

/** Plain-language deadline for a run sheet header. */
export function removalWindowLabel(placement: SignPlacement): string {
  if (placement === "MTO_HIGHWAY") {
    return "3 working days after voting day (MTO collects and destroys after that)";
  }
  return `${REMOVAL_HOURS[placement]} hours after voting day`;
}

/**
 * How much trouble an outstanding sign is in.
 *
 * "due" is the warning state — the deadline is inside the next day and the sign
 * is still up. "overdue" is past it, which is the state that draws complaints.
 */
export type RemovalUrgency = "none" | "soon" | "due" | "overdue";

export function removalUrgency(
  dueAt: Date | string | null | undefined,
  now: Date = new Date(),
): RemovalUrgency {
  if (!dueAt) return "none";
  const due = new Date(dueAt).getTime();
  const hoursLeft = (due - now.getTime()) / 3_600_000;
  if (hoursLeft < 0) return "overdue";
  if (hoursLeft <= 24) return "due";
  if (hoursLeft <= 72) return "soon";
  return "none";
}

export const URGENCY_TONE: Record<RemovalUrgency, "neutral" | "warn" | "bad"> = {
  none: "neutral",
  soon: "neutral",
  due: "warn",
  overdue: "bad",
};

/* ----------------------------------------------------------- placing them --- */

/**
 * What the crew needs to be told before they put a sign in this kind of ground.
 *
 * Shown on the placement form rather than buried in a help page, because the
 * moment someone is standing on a shoulder with a mallet is the moment the
 * setback matters.
 */
export const PLACEMENT_CAUTIONS: Record<SignPlacement, string[]> = {
  PRIVATE_LAWN: [
    "Get the owner's permission before the sign goes in, and record who gave it.",
    "Keep it clear of the sight triangle at corner lots.",
  ],
  PRIVATE_COMMERCIAL: [
    "Permission comes from the owner, not the tenant, unless the lease says otherwise.",
    "A business displaying a sign is making its own statement — make sure they mean to.",
  ],
  MUNICIPAL_ROW: [
    "Most by-laws prohibit signs on the road allowance, boulevard or median entirely. Check yours before placing.",
    "Never in a sight triangle, and never attached to a utility pole, hydrant or municipal sign.",
    "By-law officers remove non-compliant signs, sometimes with a recovery fee.",
  ],
  MTO_HIGHWAY: [
    "Prohibited outright on freeways and principal arterials — the 400-series, Hwy 11, Hwy 69.",
    "Permitted on Class 2B, 3 and 4 highways once the election is called.",
    "Signs up to 0.7 m²: at least 4 m back from the edge of the pavement. From 0.7 m² to 3.7 m²: at the outer limit of the right-of-way.",
    "One sign per direction of travel per 2 km of highway.",
    "Nothing fixed to a highway sign, guide rail or structure.",
  ],
  OTHER_PUBLIC: [
    "Assume it is prohibited until the by-law says otherwise — parks, school grounds and municipal lots usually are.",
    "Never within the statutory no-campaigning distance of a voting place.",
  ],
};

/** Placements where the app should insist on a landmark instead of an address. */
export function needsLandmark(placement: SignPlacement): boolean {
  return placement === "MUNICIPAL_ROW"
    || placement === "MTO_HIGHWAY"
    || placement === "OTHER_PUBLIC";
}
