import {
  DESIGN_FEE_CENTS,
  TAX_RATE,
  type OptionChoice,
  type PriceBreak,
  type Product,
  type Variant,
} from "./catalog";

/**
 * What an order costs.
 *
 * The one place the catalogue's numbers are turned into money. The product
 * page, the cart, the checkout and the shop's own queue all call through here,
 * so what a candidate is quoted on the way in is what the order is worth on the
 * way out — there is no second sum written somewhere else that can drift.
 *
 * Integer cents throughout, like the rest of this app.
 */

/**
 * The break that applies at a given quantity: the last one at or below it.
 *
 * Ordering fewer than the smallest break does not fall off the end — it is
 * priced at the first break, which is the dearest. Quantity minimums are
 * enforced when the line is built, not here.
 */
export function applicableBreak(variant: Variant, quantity: number): PriceBreak {
  // A sheet-priced variant carries no per-piece table; its base price comes
  // from the chosen sheet instead. See priceLine().
  if (variant.breaks.length === 0) return { quantity: 1, unitPriceCents: 0 };

  let chosen = variant.breaks[0];
  for (const b of variant.breaks) {
    if (quantity >= b.quantity) chosen = b;
  }
  return chosen;
}

/**
 * The next break up, when there is one worth mentioning.
 *
 * Used to say "another 50 takes each sign from $8.50 to $7.25" on the product
 * page. Quantity breaks are the one piece of pricing a customer cannot work out
 * for themselves from a total, and a campaign that was going to order 80 signs
 * would usually rather order 100.
 */
export function nextBreak(
  variant: Variant,
  quantity: number,
): { more: number; unitPriceCents: number } | null {
  const next = variant.breaks.find((b) => b.quantity > quantity);
  // Sheet-priced products have no breaks to climb: the price per sign is the
  // same at one sheet as at ten.
  if (!next) return null;
  return { more: next.quantity - quantity, unitPriceCents: next.unitPriceCents };
}

/* ------------------------------------------------------------ sheet discount */

/**
 * Signs get cheaper by the sheet, not by the sign.
 *
 * Every additional 4' × 8' sheet an order consumes takes another 5% off the
 * whole order, to a floor of 25% — so one sheet is list, two is 5% off, three
 * is 10%, and six or more is 25% off everything. The saving is on the sheet
 * because the cost is on the sheet: the second one goes through the same setup
 * as the first.
 *
 * Sheets are counted as consumed, not as filled. An order of 13 lawn signs at
 * 12 to a sheet takes two sheets and is discounted as two, because the shop
 * has cut into the second one either way.
 */
export const SHEET_DISCOUNT_PER_SHEET = 5;
export const SHEET_DISCOUNT_MAX = 25;

export function sheetsUsed(variant: Variant, quantity: number): number {
  const perSheet = variant.signsPerSheet ?? 0;
  if (perSheet <= 0) return 0;
  return Math.max(1, Math.ceil(quantity / perSheet));
}

export function sheetDiscountPercent(sheets: number): number {
  if (sheets <= 1) return 0;
  return Math.min(SHEET_DISCOUNT_MAX, (sheets - 1) * SHEET_DISCOUNT_PER_SHEET);
}

/**
 * How many more signs would earn the next 5%, when there is one to earn.
 *
 * The counterpart of nextBreak() for sheet-priced products, and the same
 * argument for showing it: a campaign ordering 20 of a cut that yields 12 has
 * paid for a second sheet already and may as well have the other four signs.
 */
export function nextSheetDiscount(
  variant: Variant,
  quantity: number,
): { moreSigns: number; percent: number } | null {
  const perSheet = variant.signsPerSheet ?? 0;
  if (perSheet <= 0) return null;

  const sheets = sheetsUsed(variant, quantity);
  const percent = sheetDiscountPercent(sheets + 1);
  if (percent <= sheetDiscountPercent(sheets)) return null;

  // Quantities are whole sheets, so the next step up is always one more
  // sheet's worth exactly.
  return { moreSigns: (sheets + 1) * perSheet - quantity, percent };
}

/**
 * The quantity that will actually be ordered.
 *
 * On a product with fixed quantities, anything typed drops to the largest run
 * at or below it — never up, because a campaign that asked for 500 should not
 * be billed for 1000. Everything else is free to order any number above the
 * minimum.
 */
export function snapQuantity(product: Product, variant: Variant, requested: number): number {
  const wanted = Math.max(1, Math.round(requested));

  // Sheet-priced: whole sheets are what is bought, so the count lands on a
  // multiple of the cut's yield, rounded up. The sheet is cut into either way —
  // ordering 13 of a twelve-up cut consumes two sheets — and the remaining
  // eleven signs are worth more in the candidate's garage than in the offcut
  // bin, which is why this rounds up rather than refusing.
  const perSheet = variant.signsPerSheet ?? 0;
  if (perSheet > 0) return Math.max(1, Math.ceil(wanted / perSheet)) * perSheet;

  if (!product.quantitiesFixed || variant.breaks.length === 0) {
    return Math.max(wanted, variant.minQuantity);
  }

  const runs = variant.breaks.map((b) => b.quantity).sort((a, b) => a - b);
  let chosen = runs[0];
  for (const run of runs) {
    if (wanted >= run) chosen = run;
  }
  return chosen;
}

export type ChosenOptions = Record<string, string>;

export type PricedLine = {
  quantity: number;
  /** One piece, with the per-unit surcharges of the chosen options folded in. */
  unitPriceCents: number;
  setupFeeCents: number;
  lineTotalCents: number;
  /** "Double-sided · One stake per sign", for the cart and the run sheet. */
  optionsSummary: string;
  /** The chosen options, cleaned back to values the catalogue actually offers. */
  options: ChosenOptions;
  /** Sheet-priced products only: how many sheets this line consumes, and the
   *  volume discount that earned. Zero elsewhere. */
  sheetsUsed: number;
  discountPercent: number;
};

/**
 * Price one line.
 *
 * Options handed in are resolved against the catalogue rather than trusted: an
 * option group that does not exist is dropped, and a value that is not one of
 * its choices falls back to the group's first choice. The form is generated
 * from the same catalogue, so this only fires on a hand-made request — but a
 * surcharge a customer chose for themselves is exactly the kind of thing that
 * should not be possible.
 */
export function priceLine(
  product: Product,
  variant: Variant,
  quantity: number,
  chosen: ChosenOptions,
): PricedLine {
  const resolved: ChosenOptions = {};
  const labels: string[] = [];
  let unitSurcharge = 0;
  let flatSurcharge = 0;
  let percentSurcharge = 0;

  const safeQuantity = Math.max(1, Math.round(quantity));

  // Signs are priced off the sheet: the chosen thickness and sides give a sheet
  // price, and the cut says how many signs that sheet yields. Everything else
  // is priced from a per-piece quantity table.
  let baseUnitCents: number;
  let sheets = 0;
  let discountPercent = 0;
  // What the sheets themselves come to, before any per-sign extras. Held apart
  // because on a sheet-priced product THIS is the real figure: whole sheets are
  // what the shop buys and what the candidate orders, and a total that is not a
  // whole number of them would put every order a few cents out.
  let sheetGoodsCents: number | null = null;
  /** Set when the run itself carries a price. Same rule, different unit. */
  let lineGoodsCents: number | null = null;

  const sheetPricing = product.sheetPricing;
  if (sheetPricing && variant.signsPerSheet) {
    const choice =
      sheetPricing.choices.find((c) => c.value === chosen[sheetPricing.key]) ??
      sheetPricing.choices[0];
    resolved[sheetPricing.key] = choice.value;
    labels.push(choice.label);

    sheets = sheetsUsed(variant, safeQuantity);
    discountPercent = sheetDiscountPercent(sheets);
    const sheetPrice = Math.round(choice.sheetPriceCents * (1 - discountPercent / 100));

    sheetGoodsCents = sheets * sheetPrice;
    // Per sign, for display. It is the sheet total divided up, not the other way
    // round: dividing $270 by 32 and multiplying back lands eight cents above a
    // sheet that costs $270.
    baseUnitCents = Math.round(sheetGoodsCents / safeQuantity);
  } else {
    const step = applicableBreak(variant, safeQuantity);
    // A run with a price of its own: that price is the line, and the per-piece
    // figure is derived from it rather than the other way round.
    if (step.lineTotalCents !== undefined && step.quantity === safeQuantity) {
      lineGoodsCents = step.lineTotalCents;
      baseUnitCents = Math.round(step.lineTotalCents / safeQuantity);
    } else {
      baseUnitCents = step.unitPriceCents;
    }
  }

  for (const group of product.options) {
    // A group that does not apply to this variant is not merely hidden — it is
    // not recorded either, so a wire stand cannot be attached to a 4' × 8'
    // board by posting the field by hand.
    if (group.onlyForVariants && !group.onlyForVariants.includes(variant.key)) continue;

    const choice: OptionChoice =
      group.choices.find((c) => c.value === chosen[group.key]) ?? group.choices[0];
    resolved[group.key] = choice.value;
    labels.push(choice.label.replace(/\s*\(\+\$[^)]*\)\s*$/, ""));
    unitSurcharge += choice.unitSurchargeCents ?? 0;
    flatSurcharge += choice.flatSurchargeCents ?? 0;
    percentSurcharge += choice.surchargePercent ?? 0;
  }

  const unitPriceCents = baseUnitCents + unitSurcharge;
  const setupFeeCents = variant.setupFeeCents + flatSurcharge;

  // Sheets first, then the per-sign extras, then setup — so a whole-sheet order
  // comes to exactly what the sheets cost. Everything not priced by the sheet
  // multiplies out as usual.
  const fixedGoods = sheetGoodsCents ?? lineGoodsCents;
  // The percentage rides on the printing alone. Not on the setup fee, which is
  // file work and the same either way, and not on anything charged per piece.
  const printedGoods =
    fixedGoods === null ? baseUnitCents * safeQuantity : fixedGoods;
  const goodsCents =
    Math.round(printedGoods * (1 + percentSurcharge / 100)) + unitSurcharge * safeQuantity;

  return {
    quantity: safeQuantity,
    unitPriceCents,
    setupFeeCents,
    lineTotalCents: goodsCents + setupFeeCents,
    optionsSummary: labels.join(" · "),
    options: resolved,
    sheetsUsed: sheets,
    discountPercent,
  };
}

/**
 * Apparel is ordered as a run of sizes rather than one count.
 *
 * Reads whatever counts were submitted, keeps only sizes the product actually
 * comes in, drops the zeroes, and hands back the total — which is the quantity
 * the price breaks are then read at.
 */
export function readSizeRun(
  product: Product,
  counts: Record<string, unknown>,
): { sizes: Record<string, number>; quantity: number } {
  const sizes: Record<string, number> = {};
  let quantity = 0;

  for (const size of product.sizes ?? []) {
    const raw = Number(counts[size] ?? 0);
    const count = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    if (count > 0) {
      sizes[size] = count;
      quantity += count;
    }
  }

  return { sizes, quantity };
}

/** "12 × M, 8 × L" — how a size run reads in the cart and on the job ticket. */
export function describeSizeRun(sizes: Record<string, number>): string {
  return Object.entries(sizes)
    .filter(([, count]) => count > 0)
    .map(([size, count]) => `${count} × ${size}`)
    .join(", ");
}

export type OrderTotals = {
  subtotalCents: number;
  designFeeCents: number;
  deliveryCents: number;
  adjustmentCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
};

/**
 * What the whole order comes to.
 *
 * Design is charged once per order, not per line: a candidate having their
 * signs, cards and hangers designed is having one identity designed. Delivery
 * and the adjustment are the shop's to fill in — delivery because a rural
 * drop is not a rate table, and the adjustment because a printer has always
 * been able to take something off a price.
 *
 * Tax goes on everything, including the design work and the delivery, which is
 * how HST works on a single supply.
 */
export function orderTotals(input: {
  lineTotals: number[];
  needsDesign: boolean;
  deliveryCents?: number;
  adjustmentCents?: number;
}): OrderTotals {
  const subtotalCents = input.lineTotals.reduce((sum, n) => sum + n, 0);
  const designFeeCents = input.needsDesign ? DESIGN_FEE_CENTS : 0;
  const deliveryCents = input.deliveryCents ?? 0;
  const adjustmentCents = input.adjustmentCents ?? 0;

  const taxableCents = subtotalCents + designFeeCents + deliveryCents + adjustmentCents;
  const taxCents = Math.round(taxableCents * TAX_RATE);

  return {
    subtotalCents,
    designFeeCents,
    deliveryCents,
    adjustmentCents,
    taxableCents,
    taxCents,
    totalCents: taxableCents + taxCents,
  };
}
