import { db } from "@/lib/db";

/**
 * Apparel: what it costs the shop, and what it sells for.
 *
 * Garments are not priced like print. A sign's price comes out of a sheet
 * bought by the sheet; a shirt's comes from SanMar's cost for that style, in
 * that colour, in that size — a 2XL costs more than a medium — and it changes
 * when they change it. So the garment data lives in the database, refreshed
 * from SanMar, and src/lib/shop/catalog.ts names the style and nothing else.
 *
 * The shop's rule, in one place:
 *
 *   retail per garment = the greater of (cost doubled) and $12
 *   plus $45 screen setup, once per line
 *
 * The floor is what stops a cheap tee being sold for less than it costs to
 * handle: the doubling covers the garment, but folding, boxing and answering
 * the phone about it do not get cheaper because the shirt did.
 *
 * DOUBLE IS DELIBERATE, AND IS NOT THE PRINT MARKUP. Trade print is marked up
 * by PRINT_MARKUP_PERCENT, which is 50 — cards come off a press and arrive on a
 * pallet. A garment is handled one at a time, in a size and a colour somebody
 * chose, and gets pressed, counted and bagged here. Confirmed by Darren on
 * 5 September 2026, after the print markup came down from 100 and this did not.
 * Do not "fix" the inconsistency by pointing this at PRINT_MARKUP_PERCENT.
 */

/** Screen setup, charged once per line rather than per garment. */
export const GARMENT_SETUP_CENTS = 4500;

/** Nothing leaves the shop under this, however cheap the blank was. */
export const GARMENT_FLOOR_CENTS = 1200;

export const GARMENT_MARKUP_PERCENT = 100;

/** What one garment sells for, given what it cost. */
export function garmentRetailCents(costCents: number): number {
  const marked = Math.round(costCents * (1 + GARMENT_MARKUP_PERCENT / 100));
  return Math.max(marked, GARMENT_FLOOR_CENTS);
}

export type GarmentOption = {
  colourName: string;
  colourCode: string;
  sizes: { size: string; costCents: number; retailCents: number; available: boolean }[];
};

export type GarmentStyleView = {
  styleCode: string;
  brand: string;
  name: string;
  description: string;
  syncedAt: Date | null;
  colours: GarmentOption[];
  /** Every size the style comes in, across all colours, in wearing order. */
  sizes: string[];
  /** The cheapest garment in the style, for a "from $x". Zero when unpriced. */
  fromRetailCents: number;
};

/** Small to large, rather than alphabetical, which would put 2XL before S. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

function bySize(a: string, b: string): number {
  const ai = SIZE_ORDER.indexOf(a.toUpperCase());
  const bi = SIZE_ORDER.indexOf(b.toUpperCase());
  // Anything unrecognised sorts to the end rather than to the front, where it
  // would look like the smallest size.
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
}

/**
 * One style's colours, sizes and prices, or null when nothing has been synced
 * for it yet — which is the normal state before the SanMar connection exists,
 * and why the catalogue lists apparel without offering it.
 */
export async function garmentStyle(styleCode: string): Promise<GarmentStyleView | null> {
  const style = await db.garmentStyle.findUnique({
    where: { styleCode },
    include: { skus: { orderBy: [{ colourName: "asc" }] } },
  });
  if (!style || !style.isActive || style.skus.length === 0) return null;

  const colours = new Map<string, GarmentOption>();
  for (const sku of style.skus) {
    const entry = colours.get(sku.colourName) ?? {
      colourName: sku.colourName,
      colourCode: sku.colourCode,
      sizes: [],
    };
    entry.sizes.push({
      size: sku.size,
      costCents: sku.costCents,
      retailCents: garmentRetailCents(sku.costCents),
      available: sku.available,
    });
    colours.set(sku.colourName, entry);
  }

  for (const colour of colours.values()) colour.sizes.sort((a, b) => bySize(a.size, b.size));

  const sizes = [...new Set(style.skus.map((s) => s.size))].sort(bySize);
  const prices = style.skus.filter((s) => s.available).map((s) => garmentRetailCents(s.costCents));

  return {
    styleCode: style.styleCode,
    brand: style.brand,
    name: style.name,
    description: style.description,
    syncedAt: style.syncedAt,
    colours: [...colours.values()],
    sizes,
    fromRetailCents: prices.length > 0 ? Math.min(...prices) : 0,
  };
}

/** Every style the shop has data for, for the queue and the import report. */
export async function garmentStyles(): Promise<
  { styleCode: string; name: string; source: string; skuCount: number; syncedAt: Date | null }[]
> {
  const styles = await db.garmentStyle.findMany({
    orderBy: { styleCode: "asc" },
    include: { _count: { select: { skus: true } } },
  });

  return styles.map((style) => ({
    styleCode: style.styleCode,
    name: style.name,
    source: style.source,
    skuCount: style._count.skus,
    syncedAt: style.syncedAt,
  }));
}

/**
 * What the product page is given, and what the server prices against.
 *
 * A trimmed GarmentStyleView with no Date on it, so it crosses to the browser
 * as plain JSON. The page and the server then price the same run with the same
 * function — the storefront can show a total without being trusted to compute
 * the one that gets charged.
 */
export type GarmentChoice = {
  styleCode: string;
  name: string;
  colours: { name: string; code: string; sizes: { size: string; retailCents: number }[] }[];
  sizes: string[];
  fromRetailCents: number;
};

export function toGarmentChoice(style: GarmentStyleView): GarmentChoice {
  return {
    styleCode: style.styleCode,
    name: style.name,
    colours: style.colours.map((colour) => ({
      name: colour.colourName,
      code: colour.colourCode,
      // Only what can actually be had: a colour whose 2XL is discontinued
      // should not offer a 2XL.
      sizes: colour.sizes
        .filter((sku) => sku.available)
        .map((sku) => ({ size: sku.size, retailCents: sku.retailCents })),
    })),
    sizes: style.sizes,
    fromRetailCents: style.fromRetailCents,
  };
}

/**
 * Price a run of garments, from the choice the page was given.
 *
 * Pure, and shared by the storefront and the server for exactly that reason.
 * Every size is priced at its own cost, because that is how they are bought: a
 * run of twelve with two 2XLs costs more than twelve mediums, and averaging it
 * would quietly lose the difference on every order with a big size in it.
 *
 * `unitSurchargeCents` is the decoration — a second print location, another ink
 * colour — which is ours and per garment, on top of the shirt.
 */
export function priceGarmentChoice(
  choice: GarmentChoice,
  colourName: string,
  run: Record<string, number>,
  unitSurchargeCents = 0,
): { quantity: number; goodsCents: number; setupCents: number; totalCents: number } | null {
  const colour = choice.colours.find((c) => c.name === colourName) ?? choice.colours[0];
  if (!colour) return null;

  let quantity = 0;
  let goodsCents = 0;

  for (const [size, count] of Object.entries(run)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const sku = colour.sizes.find((s) => s.size === size);
    if (!sku) continue;

    quantity += count;
    goodsCents += (sku.retailCents + unitSurchargeCents) * count;
  }

  if (quantity === 0) return null;

  return {
    quantity,
    goodsCents,
    setupCents: GARMENT_SETUP_CENTS,
    totalCents: goodsCents + GARMENT_SETUP_CENTS,
  };
}

/**
 * Price a run of garments.
 *
 * Every size is priced at its own cost, because that is how they are bought:
 * a run of twelve with two 2XLs costs more than twelve mediums, and averaging
 * it would quietly lose the difference on every order with a big size in it.
 */
export function priceGarmentRun(
  style: GarmentStyleView,
  colourName: string,
  run: Record<string, number>,
): { quantity: number; goodsCents: number; setupCents: number; totalCents: number } | null {
  const colour = style.colours.find((c) => c.colourName === colourName) ?? style.colours[0];
  if (!colour) return null;

  let quantity = 0;
  let goodsCents = 0;

  for (const [size, count] of Object.entries(run)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const sku = colour.sizes.find((s) => s.size === size);
    if (!sku) continue;

    quantity += count;
    goodsCents += sku.retailCents * count;
  }

  if (quantity === 0) return null;

  return {
    quantity,
    goodsCents,
    setupCents: GARMENT_SETUP_CENTS,
    totalCents: goodsCents + GARMENT_SETUP_CENTS,
  };
}

/**
 * The garment data behind a product's variants, keyed by variant.
 *
 * Empty for a style nothing has been synced for, which is what keeps apparel
 * listed but unsellable until SanMar's data is in.
 */
export async function garmentChoicesFor(
  variants: { key: string; garmentStyleCode?: string }[],
): Promise<Record<string, GarmentChoice>> {
  const choices: Record<string, GarmentChoice> = {};

  for (const variant of variants) {
    if (!variant.garmentStyleCode) continue;
    const style = await garmentStyle(variant.garmentStyleCode);
    if (style) choices[variant.key] = toGarmentChoice(style);
  }

  return choices;
}
