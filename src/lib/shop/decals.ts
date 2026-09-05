/**
 * Decals, which are not priced like anything else here.
 *
 * A candidate says what shape, what size and how many; the price comes from how
 * much vinyl that actually consumes. Everything else in this catalogue is a
 * fixed thing with a fixed price, so this is the one product that has to be
 * worked out rather than looked up.
 *
 * The arithmetic follows the roll:
 *
 *   - Vinyl comes 54 inches wide, and a job consumes the full width of whatever
 *     length it runs. You cannot buy half a roll's width.
 *   - Decals are nested across that width with an inch between them, and an
 *     inch between rows, so the cutter has somewhere to go.
 *   - What is charged is the area of roll used: 54 inches by the length run.
 *
 * A round decal is nested by the square it sits in — a 6 inch circle takes a
 * 6 inch square of roll, and the corners are waste whatever the shape.
 *
 * The rate and the minimum are the shop's own.
 */

/** Usable roll width, in inches. */
export const ROLL_WIDTH_INCHES = 54;

/** Gap between decals, and between rows, in inches. */
export const DECAL_GAP_INCHES = 1;

/** Printed vinyl, per square foot of roll consumed. */
export const DECAL_PER_SQ_FT_CENTS = 1200;

/** Nothing leaves the shop under this, however small the job. */
export const DECAL_MINIMUM_CENTS = 5000;

export type DecalNesting = {
  /** How many fit across the roll. */
  across: number;
  rows: number;
  /** Roll consumed, in inches of length. */
  lengthInches: number;
  squareFeet: number;
};

/**
 * How much roll a run of decals eats.
 *
 * Returns null when one will not fit across the width at all — a 60 inch decal
 * cannot come off a 54 inch roll, and saying so is better than quoting for
 * something impossible.
 */
export function nestDecals(
  widthInches: number,
  heightInches: number,
  quantity: number,
): DecalNesting | null {
  const w = Math.max(0, widthInches);
  const h = Math.max(0, heightInches);
  const n = Math.max(0, Math.round(quantity));
  if (w <= 0 || h <= 0 || n <= 0) return null;
  if (w > ROLL_WIDTH_INCHES) return null;

  // n across need n widths and n-1 gaps: n*w + (n-1)*gap <= roll.
  const across = Math.max(
    1,
    Math.floor((ROLL_WIDTH_INCHES + DECAL_GAP_INCHES) / (w + DECAL_GAP_INCHES)),
  );
  const rows = Math.ceil(n / across);
  const lengthInches = rows * h + (rows - 1) * DECAL_GAP_INCHES;

  return {
    across,
    rows,
    lengthInches,
    // The full width is consumed whether it is filled or not.
    squareFeet: (ROLL_WIDTH_INCHES * lengthInches) / 144,
  };
}

export type DecalPrice = {
  nesting: DecalNesting;
  squareFeet: number;
  vinylCents: number;
  /** True when the job is small enough that the minimum is what is charged. */
  minimumApplied: boolean;
  totalCents: number;
};

/**
 * What a run of decals costs, before any file-prep charge.
 *
 * The minimum is not a surcharge on top: a job under it is simply charged the
 * minimum, because setting up a print run costs what it costs whether it is one
 * decal or twenty.
 */
export function priceDecals(input: {
  widthInches: number;
  heightInches: number;
  quantity: number;
  perSquareFootCents?: number;
}): DecalPrice | null {
  const nesting = nestDecals(input.widthInches, input.heightInches, input.quantity);
  if (!nesting) return null;

  const rate = input.perSquareFootCents ?? DECAL_PER_SQ_FT_CENTS;
  const vinylCents = Math.round(nesting.squareFeet * rate);
  const minimumApplied = vinylCents < DECAL_MINIMUM_CENTS;

  return {
    nesting,
    squareFeet: nesting.squareFeet,
    vinylCents,
    minimumApplied,
    totalCents: minimumApplied ? DECAL_MINIMUM_CENTS : vinylCents,
  };
}

/** "2 across, 5 rows — 64\" of 54\" roll, 24.0 sq ft" for the cart and the queue. */
export function describeNesting(nesting: DecalNesting): string {
  return (
    `${nesting.across} across, ${nesting.rows} ${nesting.rows === 1 ? "row" : "rows"} — ` +
    `${nesting.lengthInches}" of ${ROLL_WIDTH_INCHES}" roll, ${nesting.squareFeet.toFixed(1)} sq ft`
  );
}
