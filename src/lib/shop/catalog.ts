/**
 * The price list.
 *
 * Everything the election portal sells, what it costs, and the choices a
 * candidate makes when ordering it. This file is the only place any of that is
 * written down: the catalogue pages render from it, the configurator builds its
 * form from it, and src/lib/shop/pricing.ts is the only thing that reads the
 * numbers. Editing a price here changes it everywhere at once.
 *
 * It is deliberately not in the database. A price list is something the shop
 * edits and ships with a release, not data a customer can reach — and keeping
 * it in code means a price change arrives reviewed, in a commit, with the old
 * numbers still readable in the history.
 *
 * Every order snapshots the names and the cents it was quoted at (see
 * ShopOrderItem), so changing a price here never rewrites an order already
 * placed.
 *
 * All money is integer cents, like everywhere else in this app.
 *
 * ---------------------------------------------------------------------------
 * WHICH OF THESE PRICES ARE REAL
 *
 *   Signs            The shop's own sheet prices. Real. The wire stand is the
 *                    one figure still made up.
 *   Post cards       Placeholder, until SinaLite's trade cost comes back and
 *   Door hangers     the tables are re-derived as cost doubled plus prep.
 *   T-shirts         Placeholder, and the specifications are provisional too —
 *   Hoodies          garments and decal stocks are still to be settled.
 *   Decals
 *
 * Only the signs are orderable today. Everything else carries `comingSoon:
 * true`, which lists it without a price and without a cart button — a candidate
 * working out a budget still learns the shop does hoodies, and nobody is quoted
 * a figure that is not ready. Clear the flag on a product once its real prices
 * are in, and clear `pricingProvisional` with it.
 * ---------------------------------------------------------------------------
 */

/** A quantity break: at `quantity` or more, each piece costs `unitPriceCents`. */
export type PriceBreak = { quantity: number; unitPriceCents: number };

export type Variant = {
  key: string;
  name: string;
  /** The specification, in the words a printer would use. */
  detail: string;
  /** Proof, file prep and press or screen setup. Charged once per line. */
  setupFeeCents: number;
  minQuantity: number;
  /** Ascending by quantity. The last break at or below the order decides.
   *  Empty on a product priced off a sheet — see signsPerSheet. */
  breaks: PriceBreak[];
  /**
   * How many of this cut come out of one 4' × 8' sheet.
   *
   * Signs are priced off the sheet rather than off a per-piece table, because
   * that is how they are actually bought and cut: the shop pays for a sheet
   * whatever is done to it, and every size in the catalogue divides one evenly.
   * Set on signs, absent everywhere else.
   */
  signsPerSheet?: number;
};

export type OptionChoice = {
  value: string;
  label: string;
  /** Added to the price of every piece. */
  unitSurchargeCents?: number;
  /** Added once to the line. */
  flatSurchargeCents?: number;
};

export type OptionGroup = {
  key: string;
  label: string;
  hint?: string;
  choices: OptionChoice[];
  /**
   * Limits the group to certain variants. Wire stands only hold a sign up to
   * about 16 × 32; offering them against a 4' × 8' board would be selling
   * somebody something that bends over in the first wind.
   */
  onlyForVariants?: string[];
};

/**
 * A whole-sheet price, for products cut from 4' × 8' stock.
 *
 * The thickness and the number of printed sides move together — 6mm
 * double-sided is one price, not a base plus two surcharges — so they are one
 * choice with one price on it rather than two option groups whose surcharges
 * would have to be kept in step.
 */
export type SheetPrice = {
  value: string;
  label: string;
  detail?: string;
  sheetPriceCents: number;
};

export type SheetPricing = {
  key: string;
  label: string;
  hint?: string;
  choices: SheetPrice[];
};

export type Product = {
  slug: string;
  name: string;
  /** One line, on the card in the catalogue. */
  tagline: string;
  /** A paragraph on the product page. */
  description: string;
  /** A glyph, in the same register as the rest of this app's icons. */
  icon: string;
  /** Working days from approved proof to ready. Shown, and used for the
   *  "order by" arithmetic against a candidate's needed-by date. */
  leadTimeDays: number;
  variants: Variant[];
  options: OptionGroup[];
  /** Set when the product is priced by the sheet rather than by a per-piece
   *  quantity table. The chosen sheet price, divided by the cut's yield, is
   *  what one piece costs. */
  sheetPricing?: SheetPricing;
  /** Apparel is ordered as a run of sizes rather than a single count. */
  sizes?: string[];
  /**
   * Only the quantities in the price breaks can be ordered — no box to type a
   * number into.
   *
   * True for anything bought from the trade printer, because at their end the
   * quantity is not a number at all: it is one of a fixed set of option ids
   * (see src/lib/shop/vendor-map.ts). Offering 400 post cards when they run
   * 250 and 500 would take an order nobody can fill.
   */
  quantitiesFixed?: boolean;
  /** What the shop needs from the candidate if they are supplying files. */
  artworkHint: string;
  /**
   * The prices on this product are not the shop's final ones yet, so the page
   * says so rather than letting a placeholder read as a quote.
   */
  pricingProvisional?: boolean;
  /**
   * Listed, but not orderable yet.
   *
   * The catalogue still carries it — a candidate deciding what to spend on
   * wants to know the shop does hoodies — but no price is shown and nothing can
   * be added to a cart. Cheaper than hiding it and better than quoting a figure
   * that is not ready.
   */
  comingSoon?: boolean;
  /**
   * Collected from the shop, never shipped. Signs are cut here and go out on a
   * trailer or in the back of a car; nothing about them wants a courier.
   */
  pickupOnly?: boolean;
};

/** Design service, charged once per order when the shop is doing the artwork. */
export const DESIGN_FEE_CENTS = 9500;

/** Ontario HST. Municipal campaign purchases are taxable like any other. */
export const TAX_RATE = 0.13;
export const TAX_LABEL = "HST (13%)";

export const PRODUCTS: Product[] = [
  {
    slug: "signs",
    name: "Signs",
    tagline: "Every size cut from a 4' × 8' sheet",
    description:
      "Corrugated plastic signs, printed full colour. Sign prices here are the " +
      "price of a 4' × 8' sheet divided by how many of that cut come out of it, " +
      "which is why these seven sizes and not others — each one divides a sheet " +
      "exactly, with nothing thrown away. That also explains the shape of the " +
      "price list: a 12 × 12 is a thirty-second of a sheet, so it costs a " +
      "thirty-second of the sheet. Thickness and the number of printed sides " +
      "are chosen together, because they are priced together. Every additional " +
      "sheet an order runs takes another 5% off the whole order, to a floor of " +
      "25% at six sheets.",
    icon: "▤",
    leadTimeDays: 5,
    pickupOnly: true,
    artworkHint:
      "PDF at full size with 0.125\" bleed, text kept 0.5\" inside the trim. " +
      "Vector logos if you have them — a logo lifted off a website will not " +
      "hold up at 24 inches, let alone at eight feet.",
    sheetPricing: {
      key: "sheet",
      label: "Thickness and printed sides",
      hint:
        "Priced by the sheet. 6mm is the one to take where a sign stands all " +
        "autumn or catches wind off a field; double-sided reads from both " +
        "directions of travel.",
      choices: [
        {
          value: "4MM_SINGLE",
          label: "4mm, single-sided",
          detail: "4mm corrugated plastic, printed one side",
          sheetPriceCents: 21000,
        },
        {
          value: "6MM_SINGLE",
          label: "6mm, single-sided",
          detail: "6mm corrugated plastic, printed one side",
          sheetPriceCents: 26500,
        },
        {
          value: "4MM_DOUBLE",
          label: "4mm, double-sided",
          detail: "4mm corrugated plastic, printed both sides",
          sheetPriceCents: 27000,
        },
        {
          value: "6MM_DOUBLE",
          label: "6mm, double-sided",
          detail: "6mm corrugated plastic, printed both sides",
          sheetPriceCents: 32000,
        },
      ],
    },
    // Minimum order is one sheet's worth of whichever cut is chosen. A sheet is
    // consumed whether it is fully cut up or not, so half a sheet of 12 × 12s
    // would have to be priced as a whole one anyway.
    variants: [
      {
        key: "12x12",
        name: '12" × 12"',
        detail: "32 from a sheet — window cards, rider signs, in-store",
        setupFeeCents: 0,
        minQuantity: 32,
        signsPerSheet: 32,
        breaks: [],
      },
      {
        key: "12x16",
        name: '12" × 16"',
        detail: "24 from a sheet — small lawn sign, boulevards and windows",
        setupFeeCents: 0,
        minQuantity: 24,
        signsPerSheet: 24,
        breaks: [],
      },
      {
        key: "16x24",
        name: '16" × 24"',
        detail: "12 from a sheet — the ordinary lawn sign, and the one most campaigns buy in bulk",
        setupFeeCents: 0,
        minQuantity: 12,
        signsPerSheet: 12,
        breaks: [],
      },
      {
        key: "24x32",
        name: '24" × 32"',
        detail: "6 from a sheet — corner lots and busy streets",
        setupFeeCents: 0,
        minQuantity: 6,
        signsPerSheet: 6,
        breaks: [],
      },
      {
        key: "32x48",
        name: '32" × 48"',
        detail: "3 from a sheet — reads from a moving car",
        setupFeeCents: 0,
        minQuantity: 3,
        signsPerSheet: 3,
        breaks: [],
      },
      {
        key: "48x48",
        name: '48" × 48"',
        detail: "2 from a sheet — roadside board, wants two posts and a frame",
        setupFeeCents: 0,
        minQuantity: 2,
        signsPerSheet: 2,
        breaks: [],
      },
      {
        key: "48x96",
        name: "4' × 8' board",
        detail: "The whole sheet — the farm fence line board",
        setupFeeCents: 0,
        minQuantity: 1,
        signsPerSheet: 1,
        breaks: [],
      },
    ],
    options: [
      {
        key: "stands",
        label: "Wire stands",
        hint:
          "A wire H-stand holds a sign up to about 16 × 32. Anything larger " +
          "goes on posts or in a frame, which the shop quotes with the order.",
        onlyForVariants: ["12x12", "12x16", "16x24"],
        choices: [
          { value: "WITH", label: "One wire stand per sign (+$2.00 each)", unitSurchargeCents: 200 },
          { value: "WITHOUT", label: "No stands — I have them" },
        ],
      },
    ],
  },
  {
    slug: "post-cards",
    name: "Post cards",
    tagline: "Mailers and hand-outs, printed both sides",
    description:
      "14pt card with a UV high gloss coating both sides, printed full colour " +
      "and trimmed square. The 4×6 is the workhorse — it fits a letterbox, a " +
      "canvasser's hand and Canada Post's Neighbourhood Mail dimensions. The " +
      "5×7 is what candidates order when the piece has to carry a platform " +
      "rather than a name. One stock, because a gloss card is what stands up " +
      "to a wet mailbox in October.",
    icon: "▭",
    leadTimeDays: 4,
    comingSoon: true,
    pricingProvisional: true,
    quantitiesFixed: true,
    artworkHint:
      "PDF, both sides, 0.125\" bleed. The UV coating is glossy and sealed, so " +
      "nothing can be written on these afterwards — if a canvasser needs to add " +
      "a name at the door, order door hangers instead.",
    variants: [
      {
        key: "4x6",
        name: "4\" × 6\" post card",
        detail: "14pt card, UV high gloss both sides, full colour",
        setupFeeCents: 2000,
        minQuantity: 250,
        breaks: [
          { quantity: 250, unitPriceCents: 42 },
          { quantity: 500, unitPriceCents: 28 },
          { quantity: 1000, unitPriceCents: 21 },
          { quantity: 2500, unitPriceCents: 16 },
          { quantity: 5000, unitPriceCents: 13 },
        ],
      },
      {
        key: "5x7",
        name: "5\" × 7\" post card",
        detail: "14pt card, UV high gloss both sides, full colour",
        setupFeeCents: 2000,
        minQuantity: 250,
        breaks: [
          { quantity: 250, unitPriceCents: 58 },
          { quantity: 500, unitPriceCents: 39 },
          { quantity: 1000, unitPriceCents: 29 },
          { quantity: 2500, unitPriceCents: 23 },
        ],
      },
    ],
    // No coating choice: the shop buys one stock for these, and offering a
    // finish it does not buy would take an order it cannot place.
    options: [],
  },
  {
    slug: "door-hangers",
    name: "Door hangers",
    tagline: "What gets left when nobody answers",
    description:
      "14pt card with a UV high gloss coating both sides, die-cut with a " +
      "hanging hole, printed full colour. Order more of these than you think: " +
      "a canvass reaches an answered door about one time in three, and the " +
      "hanger is what does the work at the other two.",
    icon: "⌸",
    leadTimeDays: 5,
    comingSoon: true,
    pricingProvisional: true,
    quantitiesFixed: true,
    artworkHint:
      "PDF, both sides, 0.125\" bleed. Keep the top 1.5\" clear of anything that " +
      "matters — that is where the die cuts the hole. The gloss coating cannot " +
      "be written on, so print the blanks you need rather than leaving space " +
      "for a pen.",
    variants: [
      {
        key: "4.25x11",
        name: "4.25\" × 11\" door hanger",
        detail: "14pt card, UV high gloss both sides, die-cut hanging hole",
        setupFeeCents: 3500,
        minQuantity: 250,
        breaks: [
          { quantity: 250, unitPriceCents: 62 },
          { quantity: 500, unitPriceCents: 46 },
          { quantity: 1000, unitPriceCents: 36 },
          { quantity: 2500, unitPriceCents: 29 },
        ],
      },
      {
        key: "3.5x8.5",
        name: "3.5\" × 8.5\" door hanger",
        detail: "14pt card, UV high gloss both sides, die-cut hanging hole",
        setupFeeCents: 3500,
        minQuantity: 250,
        breaks: [
          { quantity: 250, unitPriceCents: 52 },
          { quantity: 500, unitPriceCents: 38 },
          { quantity: 1000, unitPriceCents: 30 },
          { quantity: 2500, unitPriceCents: 24 },
        ],
      },
    ],
    // The write-on panel is gone with the stock: a UV gloss sheet cannot be
    // written on, and there is no uncoated option on the product the shop buys.
    options: [],
  },
  {
    slug: "t-shirts",
    name: "T-shirts",
    tagline: "For the door-knocking team",
    description:
      "Softstyle cotton tees, screen printed. Order by the size run — the counts " +
      "you enter are what gets printed, so a team of twelve with three larges " +
      "gets three larges. Screen setup is charged once per design, which is why " +
      "the price per shirt falls away so sharply at 24.",
    icon: "♟",
    leadTimeDays: 10,
    comingSoon: true,
    pricingProvisional: true,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    artworkHint:
      "Vector artwork (AI, EPS or PDF) if you have it. Screen printing wants " +
      "solid colours and clean edges — a photograph does not screen well.",
    variants: [
      {
        key: "softstyle",
        name: "Softstyle cotton tee",
        detail: "Gildan 64000, ring-spun cotton, unisex sizing",
        setupFeeCents: 4500,
        minQuantity: 12,
        breaks: [
          { quantity: 12, unitPriceCents: 2250 },
          { quantity: 24, unitPriceCents: 1875 },
          { quantity: 50, unitPriceCents: 1625 },
          { quantity: 100, unitPriceCents: 1450 },
        ],
      },
      {
        key: "performance",
        name: "Performance tee",
        detail: "Moisture-wicking polyester — for canvassing in August",
        setupFeeCents: 4500,
        minQuantity: 12,
        breaks: [
          { quantity: 12, unitPriceCents: 2750 },
          { quantity: 24, unitPriceCents: 2350 },
          { quantity: 50, unitPriceCents: 2050 },
          { quantity: 100, unitPriceCents: 1850 },
        ],
      },
    ],
    options: [
      {
        key: "placement",
        label: "Print placement",
        choices: [
          { value: "FRONT", label: "Front only" },
          { value: "FRONT_BACK", label: "Front and back (+$4.50 each)", unitSurchargeCents: 450 },
          {
            value: "FRONT_BACK_SLEEVE",
            label: "Front, back and sleeve (+$7.00 each)",
            unitSurchargeCents: 700,
          },
        ],
      },
      {
        key: "colours",
        label: "Ink colours",
        choices: [
          { value: "ONE", label: "One colour" },
          { value: "TWO", label: "Two colours (+$2.00 each)", unitSurchargeCents: 200 },
          { value: "FULL", label: "Full colour (+$3.50 each)", unitSurchargeCents: 350 },
        ],
      },
      {
        key: "shirtColour",
        label: "Shirt colour",
        choices: [
          { value: "WHITE", label: "White" },
          { value: "NAVY", label: "Navy" },
          { value: "BLACK", label: "Black" },
          { value: "RED", label: "Red" },
          { value: "ROYAL", label: "Royal blue" },
          { value: "SAFETY_GREEN", label: "Safety green" },
        ],
      },
    ],
  },
  {
    slug: "hoodies",
    name: "Hoodies",
    tagline: "October doors are cold",
    description:
      "Pullover hooded sweatshirts, screen printed. A municipal campaign runs " +
      "into November in Ontario, and a hoodie is the thing a volunteer keeps " +
      "wearing after voting day — which is worth more than most advertising.",
    icon: "♜",
    leadTimeDays: 12,
    comingSoon: true,
    pricingProvisional: true,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    artworkHint:
      "Vector artwork (AI, EPS or PDF). A front-left-chest mark and a larger " +
      "back print is the usual layout, and the one that reads at a distance.",
    variants: [
      {
        key: "pullover",
        name: "Pullover hoodie",
        detail: "Gildan 18500, cotton-poly fleece, unisex sizing",
        setupFeeCents: 4500,
        minQuantity: 6,
        breaks: [
          { quantity: 6, unitPriceCents: 5200 },
          { quantity: 12, unitPriceCents: 4600 },
          { quantity: 24, unitPriceCents: 4100 },
          { quantity: 50, unitPriceCents: 3750 },
        ],
      },
      {
        key: "full-zip",
        name: "Full-zip hoodie",
        detail: "Cotton-poly fleece with a full zip — easier on and off at doors",
        setupFeeCents: 4500,
        minQuantity: 6,
        breaks: [
          { quantity: 6, unitPriceCents: 6200 },
          { quantity: 12, unitPriceCents: 5500 },
          { quantity: 24, unitPriceCents: 4950 },
          { quantity: 50, unitPriceCents: 4500 },
        ],
      },
    ],
    options: [
      {
        key: "placement",
        label: "Print placement",
        choices: [
          { value: "LEFT_CHEST", label: "Left chest only" },
          { value: "CHEST_BACK", label: "Left chest and full back (+$6.00 each)", unitSurchargeCents: 600 },
          { value: "FULL_FRONT", label: "Full front (+$3.00 each)", unitSurchargeCents: 300 },
        ],
      },
      {
        key: "hoodieColour",
        label: "Garment colour",
        choices: [
          { value: "NAVY", label: "Navy" },
          { value: "BLACK", label: "Black" },
          { value: "CHARCOAL", label: "Charcoal" },
          { value: "RED", label: "Red" },
          { value: "ROYAL", label: "Royal blue" },
        ],
      },
    ],
  },
  {
    slug: "decals",
    name: "Decals",
    tagline: "Bumpers, tailgates and shop windows",
    description:
      "Printed vinyl with an adhesive back. Bumper decals are the cheapest " +
      "impression a campaign buys and they travel; the larger vehicle and " +
      "window decals are what goes on a supporter's truck door or a business " +
      "that has agreed to display one.",
    icon: "◈",
    leadTimeDays: 6,
    comingSoon: true,
    pricingProvisional: true,
    artworkHint:
      "Vector artwork holds up best at these sizes. Say whether the decal goes " +
      "on the outside of the glass or the inside — a window decal reading from " +
      "inside has to be printed reversed.",
    variants: [
      {
        key: "bumper",
        name: "3\" × 7.5\" bumper decal",
        detail: "Printed white vinyl, outdoor adhesive, laminated",
        setupFeeCents: 2000,
        minQuantity: 50,
        breaks: [
          { quantity: 50, unitPriceCents: 240 },
          { quantity: 100, unitPriceCents: 185 },
          { quantity: 250, unitPriceCents: 135 },
          { quantity: 500, unitPriceCents: 110 },
        ],
      },
      {
        key: "vehicle-12",
        name: "12\" × 12\" vehicle decal",
        detail: "Printed vinyl, laminated, removable adhesive",
        setupFeeCents: 2000,
        minQuantity: 10,
        breaks: [
          { quantity: 10, unitPriceCents: 1800 },
          { quantity: 25, unitPriceCents: 1450 },
          { quantity: 50, unitPriceCents: 1200 },
        ],
      },
      {
        key: "window-18",
        name: "18\" × 24\" window decal",
        detail: "Printed vinyl for a shop window or a truck door",
        setupFeeCents: 2000,
        minQuantity: 5,
        breaks: [
          { quantity: 5, unitPriceCents: 3900 },
          { quantity: 15, unitPriceCents: 3300 },
          { quantity: 30, unitPriceCents: 2850 },
        ],
      },
    ],
    options: [
      {
        key: "surface",
        label: "Where it goes",
        hint: "Reverse-printed decals are read through the glass from outside.",
        choices: [
          { value: "OUTSIDE", label: "Outside surface" },
          { value: "INSIDE_GLASS", label: "Inside the glass, reverse printed (+$0.75 each)", unitSurchargeCents: 75 },
        ],
      },
      {
        key: "shape",
        label: "Cut",
        choices: [
          { value: "SQUARE", label: "Square cut" },
          { value: "CONTOUR", label: "Contour cut to the artwork (+$0.60 each)", unitSurchargeCents: 60 },
        ],
      },
    ],
  },
];

export function productBySlug(slug: string): Product | null {
  return PRODUCTS.find((p) => p.slug === slug) ?? null;
}

export function variantByKey(product: Product, key: string): Variant | null {
  return product.variants.find((v) => v.key === key) ?? null;
}

export function optionChoice(
  product: Product,
  groupKey: string,
  value: string,
): OptionChoice | null {
  const group = product.options.find((g) => g.key === groupKey);
  if (!group) return null;
  return group.choices.find((c) => c.value === value) ?? null;
}

/** The cheapest a product can be had for, for the "from $x" on a catalogue card. */
export function startingUnitPriceCents(product: Product): number {
  const sheets = product.sheetPricing;
  const prices = product.variants.flatMap((v) =>
    sheets && v.signsPerSheet
      ? sheets.choices.map((c) => Math.round(c.sheetPriceCents / v.signsPerSheet!))
      : v.breaks.map((b) => b.unitPriceCents),
  );
  return prices.length === 0 ? 0 : Math.min(...prices);
}
