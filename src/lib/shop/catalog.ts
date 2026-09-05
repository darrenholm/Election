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
 *   Decals           The shop's own: $12 a square foot of roll consumed, $50
 *                    minimum. Live.
 *   Post cards       Placeholder, until SinaLite's trade cost comes back and
 *   Door hangers     the tables are re-derived as cost doubled plus prep.
 *   T-shirts         The styles are settled — SanMar ATC1000, the three ATCF
 *   Hoodies          fleece styles, and the S365 / SL365 polos — but every
 *   Polos            figure is a placeholder until the dealer costs are in,
 *   Decals           and no garment colours are listed because inventing a
 *                    range would have candidates picking colours that cannot
 *                    be had. Decal stocks are still to be settled.
 *
 * Only the signs are orderable today. Everything else carries `comingSoon:
 * true`, which lists it without a price and without a cart button — a candidate
 * working out a budget still learns the shop does hoodies, and nobody is quoted
 * a figure that is not ready. Clear the flag on a product once its real prices
 * are in, and clear `pricingProvisional` with it.
 * ---------------------------------------------------------------------------
 */

/**
 * A quantity break: at `quantity` or more, each piece costs `unitPriceCents`.
 *
 * On a fixed-quantity product the run has a price of its own, and
 * `lineTotalCents` carries it. That is not a nicety: 5000 small cards work out
 * at 6.72 cents each, and a unit price rounded to the nearest cent puts the
 * line up to fifty dollars out in one direction or the other. Where it is set,
 * it is the authoritative figure and the per-piece price is derived from it for
 * display — the same rule signs follow with the sheet.
 */
export type PriceBreak = {
  quantity: number;
  unitPriceCents: number;
  lineTotalCents?: number;
};

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
   * SanMar's style number, for apparel.
   *
   * The link between the catalogue and the garment data: colours, sizes and
   * costs for this variant come from the GarmentStyle rows keyed by this code,
   * not from anything written here. See src/lib/shop/garments.ts.
   */
  garmentStyleCode?: string;
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
   * Limits the group to certain variants. A wire stand holds a sign up to
   * 16 × 24 and no larger; offering one against a 4' × 8' board would be
   * selling somebody something that bends over in the first wind.
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
  /**
   * The candidate gives the dimensions and the price is worked out from them.
   *
   * Decals only. Everything else in this catalogue is a fixed thing at a fixed
   * price; a decal is whatever size somebody asks for, and what it costs comes
   * from how much roll that consumes. See src/lib/shop/decals.ts.
   */
  customSize?: boolean;
};

/**
 * File preparation, charged per item unless the candidate supplies print-ready
 * artwork.
 *
 * Most do not: a logo pulled off a website, a Word file, a photograph of last
 * election's sign. Getting any of that to press is real time, and it is time the
 * trade price does not cover. Somebody who sends a correct PDF pays nothing for
 * it, which is the whole point of charging for it — the fee is for the work,
 * not for the privilege of ordering.
 *
 * Defaulted to charging it, because most orders need it and a candidate who has
 * print-ready files knows they have them.
 */
export const ARTWORK_PREP_CENTS = 4500;

export function artworkPrepOption(): OptionGroup {
  return {
    key: "artwork",
    label: "Your artwork",
    hint: "No charge if what you send is print-ready — the right size, with bleed, in PDF.",
    choices: [
      {
        value: "PREP",
        label: "Set my files up for me (+$45)",
        flatSurchargeCents: ARTWORK_PREP_CENTS,
      },
      { value: "PRINT_READY", label: "I have print-ready PDFs" },
    ],
  };
}

/**
 * Getting a trade-printed job here, until SinaLite's own freight quote is
 * wired. A flat figure per order rather than per line: it arrives as one box.
 * Signs are cut here and collected, and pay nothing.
 */
export const TRADE_SHIPPING_FLAT_CENTS = 2500;

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
      "Corrugated plastic signs, printed full colour. Signs come in lots — 32 of " +
      "a 12 × 12, 12 of a 16 × 24, and so on — because every size here is a " +
      "clean cut from one 4' × 8' sheet, with nothing thrown away. The more lots " +
      "you order the cheaper they get: each one after the first takes another 5% " +
      "off the whole order, down to 25% off.",
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
        "6mm is the one to take where a sign stands all autumn or catches wind " +
        "off a field; double-sided reads from both directions of travel.",
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
    // A lot is one sheet's worth of whichever cut is chosen, and orders are
    // whole lots. The sheet is cut into whether or not every piece off it is
    // wanted, so half a sheet of 12 × 12s would be priced as a whole one anyway
    // — and "lots of 32" is the way to say that to somebody buying signs.
    variants: [
      {
        key: "12x12",
        name: '12" × 12" — lots of 32',
        detail: "Window cards, rider signs, in-store",
        setupFeeCents: 0,
        minQuantity: 32,
        signsPerSheet: 32,
        breaks: [],
      },
      {
        key: "12x16",
        name: '12" × 16" — lots of 24',
        detail: "Small lawn sign, boulevards and windows",
        setupFeeCents: 0,
        minQuantity: 24,
        signsPerSheet: 24,
        breaks: [],
      },
      {
        key: "16x24",
        name: '16" × 24" — lots of 12',
        detail: "The ordinary lawn sign, and the one most campaigns buy in bulk",
        setupFeeCents: 0,
        minQuantity: 12,
        signsPerSheet: 12,
        breaks: [],
      },
      {
        key: "24x32",
        name: '24" × 32" — lots of 6',
        detail: "Corner lots and busy streets",
        setupFeeCents: 0,
        minQuantity: 6,
        signsPerSheet: 6,
        breaks: [],
      },
      {
        key: "32x48",
        name: '32" × 48" — lots of 3',
        detail: "Reads from a moving car",
        setupFeeCents: 0,
        minQuantity: 3,
        signsPerSheet: 3,
        breaks: [],
      },
      {
        key: "48x48",
        name: '48" × 48" — lots of 2',
        detail: "Roadside board, wants two posts and a frame",
        setupFeeCents: 0,
        minQuantity: 2,
        signsPerSheet: 2,
        breaks: [],
      },
      {
        key: "48x96",
        name: "4' × 8' board",
        detail: "The big one, for a farm fence line. Ordered singly",
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
          "A wire H-stand holds a sign up to 16 × 24. Anything larger goes on " +
          "posts, and how it is backed depends on the thickness — see the note " +
          "under the price.",
        onlyForVariants: ["12x12", "12x16", "16x24"],
        choices: [
          { value: "WITH", label: "One wire stand per sign (+$2.00 each)", unitSurchargeCents: 200 },
          { value: "WITHOUT", label: "No stands — I have them" },
        ],
      },
      artworkPrepOption(),
    ],
  },
  {
    slug: "post-cards",
    name: "Post cards",
    tagline: "Mailers and hand-outs, printed both sides",
    description:
      "14pt card, printed full colour on one side with a UV high gloss coating, " +
      "and trimmed square. The 4.25 × 5.5 is the hand-out — it fits a letterbox, " +
      "a canvasser's hand and Canada Post's Neighbourhood Mail dimensions. The " +
      "8.5 × 5.5 is the half-page a candidate orders when the piece has to carry " +
      "a platform rather than a name. One stock, because a gloss card is what " +
      "stands up to a wet mailbox in October.",
    icon: "▭",
    // 2-4 business days at the press, plus getting it here.
    leadTimeDays: 6,
    comingSoon: true,
    pricingProvisional: true,
    quantitiesFixed: true,
    artworkHint:
      "PDF at 0.125\" bleed. Priced as printed one side; ask if you want the " +
      "back printed too. The UV coating is glossy and sealed, so nothing can be " +
      "written on these afterwards.",
    // Runs and prices are SinaLite's own, taken off the trade site on
    // 5 September 2026. lineTotalCents is trade cost DOUBLED; the per-piece
    // figure beside it is that line divided up, for display only, because at
    // 5000 a rounded unit price puts the total fifty dollars out.
    //
    // TO CONFIRM: that those figures are cost rather than retail, and the
    // file-prep fee below.
    variants: [
      {
        key: "4.25x5.5",
        name: '4.25" × 5.5" hand-out',
        detail: "14pt card, full colour one side, UV high gloss",
        setupFeeCents: 0,
        minQuantity: 500,
        breaks: [
          { quantity: 500, unitPriceCents: 18, lineTotalCents: 8790 },
          { quantity: 1000, unitPriceCents: 10, lineTotalCents: 9760 },
          { quantity: 2500, unitPriceCents: 8, lineTotalCents: 19550 },
          { quantity: 5000, unitPriceCents: 7, lineTotalCents: 33600 },
        ],
      },
      {
        key: "8.5x5.5",
        name: '8.5" × 5.5" half page',
        detail: "14pt card, full colour one side, UV high gloss",
        setupFeeCents: 0,
        minQuantity: 500,
        breaks: [
          { quantity: 500, unitPriceCents: 29, lineTotalCents: 14500 },
          { quantity: 1000, unitPriceCents: 19, lineTotalCents: 18680 },
          { quantity: 2500, unitPriceCents: 16, lineTotalCents: 39100 },
          { quantity: 5000, unitPriceCents: 12, lineTotalCents: 58300 },
        ],
      },
    ],
    // No coating choice: the shop buys one stock for these, and offering a
    // finish it does not buy would take an order it cannot place.
    options: [artworkPrepOption()],
  },
  {
    slug: "door-hangers",
    name: "Door hangers",
    tagline: "What gets left when nobody answers",
    description:
      "14pt card, die-cut with a hanging hole, printed full colour. Order more " +
      "of these than you think: a canvass reaches an answered door about one " +
      "time in three, and the hanger is what does the work at the other two.",
    icon: "⌸",
    leadTimeDays: 6,
    comingSoon: true,
    pricingProvisional: true,
    quantitiesFixed: true,
    artworkHint:
      "PDF at 0.125\" bleed. Keep the top 1.5\" clear of anything that matters — " +
      "that is where the die cuts the hole.",
    // SinaLite's runs and prices, 5 September 2026. lineTotalCents is their
    // cost doubled; the per-piece figure is that line divided up, for display.
    variants: [
      {
        key: "8.5x3.5",
        name: '8.5" × 3.5" door hanger',
        detail: "14pt card, full colour, die-cut hanging hole",
        setupFeeCents: 0,
        minQuantity: 250,
        breaks: [
          { quantity: 250, unitPriceCents: 56, lineTotalCents: 14044 },
          { quantity: 500, unitPriceCents: 41, lineTotalCents: 20394 },
          { quantity: 1000, unitPriceCents: 23, lineTotalCents: 22608 },
          { quantity: 2500, unitPriceCents: 16, lineTotalCents: 39510 },
        ],
      },
    ],
    options: [artworkPrepOption()],
  },
  {
    slug: "t-shirts",
    name: "T-shirts",
    tagline: "For the door-knocking team",
    description:
      "Screen printed tees for the people knocking on doors. Order by the size " +
      "run — the counts you enter are what gets printed, so a team of twelve " +
      "with three larges gets three larges. Screen setup is charged once per " +
      "design, which is why the price per shirt falls away so sharply once you " +
      "are past a dozen.",
    icon: "♟",
    leadTimeDays: 10,
    comingSoon: true,
    pricingProvisional: true,
    // Sizes differ by style and by cut, and these are not confirmed against
    // SanMar's size run for the ATC1000 yet.
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    artworkHint:
      "Vector artwork (AI, EPS or PDF) if you have it. Screen printing wants " +
      "solid colours and clean edges — a photograph does not screen well.",
    variants: [
      {
        // SanMar ATC1000. Garment cost, colours and the real size run come from
        // the SanMar dealer portal; the figures below are placeholders.
        key: "atc1000",
        garmentStyleCode: "ATC1000",
        name: "ATC1000",
        detail: "SanMar ATC1000",
        setupFeeCents: 4500,
        minQuantity: 12,
        breaks: [
          { quantity: 12, unitPriceCents: 2250 },
          { quantity: 24, unitPriceCents: 1875 },
          { quantity: 50, unitPriceCents: 1625 },
          { quantity: 100, unitPriceCents: 1450 },
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
      // Garment colour is deliberately not listed. The choice is SanMar's
      // range for this style, and a made-up list of six colours would be worse
      // than none: a candidate would pick one that cannot be had.
    ],
  },
  {
    slug: "hoodies",
    name: "Hoodies",
    tagline: "October doors are cold",
    description:
      "Screen printed fleece. A municipal campaign runs into November in " +
      "Ontario, and a hoodie is the thing a volunteer keeps wearing after " +
      "voting day — which is worth more than most advertising.",
    icon: "♜",
    leadTimeDays: 12,
    comingSoon: true,
    pricingProvisional: true,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    artworkHint:
      "Vector artwork (AI, EPS or PDF). A front-left-chest mark and a larger " +
      "back print is the usual layout, and the one that reads at a distance.",
    // The three SanMar ATCF fleece styles the shop carries. Which is which —
    // pullover, full zip, crewneck — and the cost of each come from the SanMar
    // dealer portal; the figures below are placeholders.
    variants: [
      {
        key: "atcf6500",
        garmentStyleCode: "ATCF6500",
        name: "ATCF6500",
        detail: "SanMar ATCF6500",
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
        key: "atcf6600",
        garmentStyleCode: "ATCF6600",
        name: "ATCF6600",
        detail: "SanMar ATCF6600",
        setupFeeCents: 4500,
        minQuantity: 6,
        breaks: [
          { quantity: 6, unitPriceCents: 5600 },
          { quantity: 12, unitPriceCents: 4950 },
          { quantity: 24, unitPriceCents: 4450 },
          { quantity: 50, unitPriceCents: 4050 },
        ],
      },
      {
        key: "atcf6700",
        garmentStyleCode: "ATCF6700",
        name: "ATCF6700",
        detail: "SanMar ATCF6700",
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
    ],
  },
  {
    slug: "polos",
    name: "Polos",
    tagline: "For the candidate, and for anyone at a booth",
    description:
      "An embroidered or printed polo is what a candidate wears to an all-" +
      "candidates meeting, a plowing match or a booth at the fall fair, where a " +
      "campaign t-shirt reads as too much and a suit reads as too little. " +
      "Ordered as a size run, the same way the shirts are.",
    icon: "♛",
    leadTimeDays: 12,
    comingSoon: true,
    pricingProvisional: true,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    artworkHint:
      "Vector artwork for embroidery, and keep it simple — thin lines and small " +
      "text do not survive being stitched. A left-chest mark is the usual place.",
    // SanMar S365 and SL365. Cost, colours and the size run of each — the
    // ladies' cut in particular — come from the SanMar dealer portal.
    variants: [
      {
        key: "s365",
        garmentStyleCode: "S365",
        name: "S365",
        detail: "SanMar S365",
        setupFeeCents: 6500,
        minQuantity: 6,
        breaks: [
          { quantity: 6, unitPriceCents: 4800 },
          { quantity: 12, unitPriceCents: 4300 },
          { quantity: 24, unitPriceCents: 3900 },
          { quantity: 50, unitPriceCents: 3600 },
        ],
      },
      {
        key: "sl365",
        garmentStyleCode: "SL365",
        name: "SL365",
        detail: "SanMar SL365",
        setupFeeCents: 6500,
        minQuantity: 6,
        breaks: [
          { quantity: 6, unitPriceCents: 4800 },
          { quantity: 12, unitPriceCents: 4300 },
          { quantity: 24, unitPriceCents: 3900 },
          { quantity: 50, unitPriceCents: 3600 },
        ],
      },
    ],
    options: [
      {
        key: "decoration",
        label: "How it is decorated",
        choices: [
          { value: "EMBROIDERY", label: "Embroidered" },
          { value: "PRINT", label: "Screen printed" },
        ],
      },
      {
        key: "placement",
        label: "Placement",
        choices: [
          { value: "LEFT_CHEST", label: "Left chest" },
          { value: "LEFT_CHEST_BACK", label: "Left chest and back (+$6.00 each)", unitSurchargeCents: 600 },
        ],
      },
    ],
  },
  {
    slug: "decals",
    name: "Decals",
    tagline: "Any size, any shape — bumpers, tailgates and shop windows",
    description:
      "Printed vinyl cut to whatever size and shape you want. Say how big and " +
      "how many and the price works itself out: decals are nested across a 54 " +
      "inch roll with an inch between them, and what is charged is the roll that " +
      "gets used. A car door decal is usually about 20 × 12 inches. Minimum " +
      "order $50, because a print run costs what it costs whether it is one " +
      "decal or twenty.",
    icon: "◈",
    leadTimeDays: 6,
    customSize: true,
    pickupOnly: true,
    artworkHint:
      "Vector artwork holds up best, and it has to be, for anything contour cut " +
      "— the cutter follows a path, not a picture. Say whether the decal goes on " +
      "the outside of the glass or the inside, because one of those is printed " +
      "in reverse.",
    variants: [
      {
        key: "custom",
        name: "Cut to your size",
        detail: "Printed vinyl, laminated, off a 54\" roll",
        setupFeeCents: 0,
        minQuantity: 1,
        breaks: [],
      },
    ],
    options: [
      {
        key: "shape",
        label: "Shape",
        hint: "Round and custom shapes are contour cut; the size you give is the space it takes up.",
        choices: [
          { value: "RECTANGLE", label: "Rectangle" },
          { value: "SQUARE", label: "Square" },
          { value: "ROUND", label: "Round" },
        ],
      },
      {
        key: "surface",
        label: "Where it goes",
        hint: "A decal read through glass from outside has to be printed in reverse.",
        choices: [
          { value: "OUTSIDE", label: "Outside surface" },
          { value: "INSIDE_GLASS", label: "Inside the glass, reverse printed" },
        ],
      },
      artworkPrepOption(),
    ],
  },
];

/**
 * Cuts too big for a wire stand. Everything here goes on posts.
 *
 * The threshold is a physical one rather than a price break: a wire H-stand
 * holds a sign up to 16 × 24, and past that the sign has to be fixed to
 * something.
 */
export const POST_MOUNTED_CUTS = ["24x32", "32x48", "48x48", "48x96"];

export type MountingNote = { tone: "warn" | "info"; text: string };

/**
 * What a candidate has to know about holding this sign up.
 *
 * Two facts of the material, and both cost money to learn the hard way.
 * Coroplast will not bridge between two posts at the ends of a large sign: at
 * 4mm it needs a backer behind it, and at 6mm strapping is enough. And a
 * post-mounted sign wanting two faces is better made as two single-sided signs
 * fixed back to back around the posts than as one double-sided sheet — both
 * faces come out clean and nothing shows through either.
 *
 * Advice rather than a rule: a large 4mm sign screwed flat to a barn wall or a
 * fence is perfectly sound, and the portal should not refuse an order it cannot
 * see the reason for.
 */
export function mountingNotes(variantKey: string, sheetValue: string): MountingNote[] {
  if (!POST_MOUNTED_CUTS.includes(variantKey)) return [];

  const notes: MountingNote[] = [];

  if (sheetValue.startsWith("4MM")) {
    notes.push({
      tone: "warn",
      text:
        "At this size 4mm will not bridge between two posts — it needs plywood or " +
        "similar behind it. 6mm does the same job with strapping and no backer, " +
        "and usually works out cheaper than buying the plywood.",
    });
  } else {
    notes.push({
      tone: "info",
      text: "At 6mm this straps to two posts without a backer.",
    });
  }

  if (sheetValue.endsWith("DOUBLE")) {
    notes.push({
      tone: "info",
      text:
        "On posts, two single-sided signs beat one double-sided: fix them back to " +
        "back with the posts sandwiched in between and both faces are clean, with " +
        "no hardware showing through either one. Order double the quantity in " +
        "single-sided instead.",
    });
  }

  return notes;
}

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
