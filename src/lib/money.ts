const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
});

const CAD_WHOLE = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

/** Format integer cents as "$1,200.00". */
export function formatCents(cents: number): string {
  return CAD.format(cents / 100);
}

/** Format integer cents with no decimals — for headline figures and limits. */
export function formatCentsShort(cents: number): string {
  return CAD_WHOLE.format(cents / 100);
}

/**
 * Parse user input into integer cents. Accepts "$1,200.50", "1200.5", "1 200",
 * and bare integers. Returns null for anything that is not a finite amount, so
 * callers can surface a validation error rather than silently storing a zero.
 */
export function parseCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const cleaned = input.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // Round on the cent to keep 19.99 from landing on 1998.9999999999998.
  return Math.round(value * 100);
}

/** Percentage of `part` against `whole`, clamped to [0, 100] and safe at zero. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}
