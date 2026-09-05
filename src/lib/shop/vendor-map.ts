import type { BillTo, ShipTo } from "./sinalite";

/**
 * Which of our products SinaLite prints, and what they call them.
 *
 * Two catalogues have to be lined up: ours, written for a candidate ("4.25 × 11
 * door hanger, uncoated write-on panel"), and theirs, written for a printer and
 * keyed by numeric ids. This file is the whole of that translation, so a change
 * at their end is one table to edit rather than a hunt through the ordering
 * code.
 *
 * Their model, which this table has to satisfy:
 *
 *   - Every choice is an option id belonging to a named group. An order sends
 *     { "Stock": "30", "size": "4", "qty": "105", "Turnaround": "140" } —
 *     their group names, their ids as strings.
 *   - THE QUANTITY IS ONE OF THOSE OPTIONS. We can only sell quantities they
 *     sell, which is why quantityOptions below is a table of exactly the runs
 *     we offer, and why the trade-printed products in our catalogue give a
 *     fixed set of quantities rather than a box to type in.
 *   - Turnaround is an option too, and there is no default. Whatever standard
 *     turnaround the shop buys goes in fixedOptions.
 *
 * THE IDS ARE NOT FILLED IN YET. They cannot be guessed. With credentials set:
 *
 *     npm run sinalite:catalog -- --find "post card"     # find the product
 *     npm run sinalite:catalog -- --product 42           # its option groups
 *
 * The second prints every option as `id  group  name`, which is exactly what
 * the tables below want. Until an entry has a productId and a qty id for the
 * run being ordered, the queue shows the line as unmapped and refuses to send
 * it — a job sent with the wrong option id is a job printed wrong.
 */

export type VendorLineMapping = {
  /** Their numeric product id, as a string. Empty means not mapped yet. */
  productId: string;
  /**
   * Which of their products this is, in words, so that filling in the id is a
   * matter of confirming a match rather than a hunt. `npm run
   * sinalite:catalog -- --suggest` matches these against their live product
   * list and prints the candidates.
   */
  productHint: { nameContains: string[]; url: string };
  /**
   * Option ids that are the same on every order of this variant — stock,
   * size, coating, turnaround. Keyed by THEIR group name.
   */
  fixedOptions: Record<string, string>;
  /**
   * Our quantity to their "qty" option id. These are the only runs that can be
   * ordered of this variant, and our catalogue's quantity breaks must match.
   */
  quantityOptions: Record<number, string>;
  /**
   * Our option group, to our value, to their group and option id.
   * `{ finish: { GLOSS: { group: "Coating", id: "93" } } }`
   */
  optionValues: Record<string, Record<string, { group: string; id: string }>>;
};

const POSTCARD_URL = "https://sinalite.com/en_ca/print-products/postcards/14pt-uv-high-gloss.html";
const DOOR_HANGER_URL =
  "https://sinalite.com/en_ca/print-products/door-hangers/14pt-uv-high-gloss.html";

/**
 * One stock, both products: 14pt with UV high gloss.
 *
 * That is what the shop buys, so it is what the portal sells — the catalogue
 * offers no coating choice on these two, because there is only one to offer.
 * The cut is the remaining choice, and it maps to their `size` option.
 */
const SINALITE: Record<string, Record<string, VendorLineMapping>> = {
  "post-cards": {
    "4.25x5.5": {
      productId: "",
      productHint: { nameContains: ["postcard", "14pt", "uv"], url: POSTCARD_URL },
      fixedOptions: {},
      quantityOptions: {},
      optionValues: {},
    },
    "8.5x5.5": {
      productId: "",
      productHint: { nameContains: ["postcard", "14pt", "uv"], url: POSTCARD_URL },
      fixedOptions: {},
      quantityOptions: {},
      optionValues: {},
    },
  },
  "door-hangers": {
    "8.5x3.5": {
      productId: "",
      productHint: { nameContains: ["door hanger", "14pt", "uv"], url: DOOR_HANGER_URL },
      fixedOptions: {},
      quantityOptions: {},
      optionValues: {},
    },
  },
};

/**
 * Every entry that still needs ids, for the catalogue script to work through.
 * The two cuts of one product share a hint and differ only in their `size`
 * option, so the same product id goes in both.
 */
export function unmappedEntries(): {
  productSlug: string;
  variantKey: string;
  mapping: VendorLineMapping;
}[] {
  const rows: { productSlug: string; variantKey: string; mapping: VendorLineMapping }[] = [];
  for (const [productSlug, variants] of Object.entries(SINALITE)) {
    for (const [variantKey, mapping] of Object.entries(variants)) {
      if (!mapping.productId) rows.push({ productSlug, variantKey, mapping });
    }
  }
  return rows;
}

/** True for products bought in rather than printed in the shop. */
export function isVendorProduct(productSlug: string): boolean {
  return productSlug in SINALITE;
}

/** Every product bought in, for the check that the catalogue still agrees. */
export function vendorProductSlugs(): string[] {
  return Object.keys(SINALITE);
}

export function vendorMappingFor(
  productSlug: string,
  variantKey: string,
): VendorLineMapping | null {
  return SINALITE[productSlug]?.[variantKey] ?? null;
}

export type ResolvedVendorLine =
  | {
      ok: true;
      productId: string;
      /** Their group name to their option id, ready to send. */
      options: Record<string, string>;
      /** The same ids, for the combination key a price is looked up by. */
      optionIds: string[];
    }
  | { ok: false; problem: string };

/**
 * Turn one of our configured lines into theirs.
 *
 * Refuses rather than guesses, at every step. An option we cannot translate
 * would otherwise be dropped and the job printed with whatever their default
 * is — gloss instead of uncoated, say — which nobody would notice until a box
 * of the wrong thing arrived.
 */
export function resolveVendorLine(
  productSlug: string,
  variantKey: string,
  quantity: number,
  chosen: Record<string, string>,
): ResolvedVendorLine {
  const mapping = vendorMappingFor(productSlug, variantKey);
  if (!mapping) {
    return { ok: false, problem: `${productSlug} / ${variantKey} is not a trade-printed line.` };
  }
  if (!mapping.productId) {
    return {
      ok: false,
      problem: `No SinaLite product id for ${productSlug} / ${variantKey} yet — run npm run sinalite:catalog and fill in src/lib/shop/vendor-map.ts.`,
    };
  }

  const quantityOptionId = mapping.quantityOptions[quantity];
  if (!quantityOptionId) {
    const sellable = Object.keys(mapping.quantityOptions);
    return {
      ok: false,
      problem: sellable.length
        ? `SinaLite does not sell ${quantity} of ${productSlug} / ${variantKey} — they run ${sellable.join(", ")}.`
        : `No SinaLite quantity ids for ${productSlug} / ${variantKey} yet — fill in quantityOptions in src/lib/shop/vendor-map.ts.`,
    };
  }

  const options: Record<string, string> = { ...mapping.fixedOptions, qty: quantityOptionId };

  for (const [ourGroup, values] of Object.entries(mapping.optionValues)) {
    const ourValue = chosen[ourGroup];
    if (!ourValue) continue;

    const theirs = values[ourValue];
    if (!theirs) {
      return {
        ok: false,
        problem: `No SinaLite option for ${ourGroup} = ${ourValue}. Add it to src/lib/shop/vendor-map.ts.`,
      };
    }
    options[theirs.group] = theirs.id;
  }

  const optionIds: string[] = Object.keys(options).map((group) => options[group] as string);
  return { ok: true, productId: mapping.productId, options, optionIds };
}

/** The quantities a trade-printed variant can actually be ordered in. */
export function sellableQuantities(productSlug: string, variantKey: string): number[] {
  const mapping = vendorMappingFor(productSlug, variantKey);
  if (!mapping) return [];
  return Object.keys(mapping.quantityOptions)
    .map(Number)
    .sort((a, b) => a - b);
}

/* ------------------------------------------------------- the shop's own -- */

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Where the trade printer ships a pickup order: the shop itself.
 *
 * Structured in the environment rather than parsed out of the free-text address
 * on the portal footer, because a courier label is not the place to be clever.
 * Returns null when it is not set, and sending is refused rather than guessed.
 */
export function shopShipTo(): ShipTo | null {
  const addressLine = process.env.SHOP_SHIP_ADDRESS || "";
  const city = process.env.SHOP_SHIP_CITY || "";
  const postalCode = process.env.SHOP_SHIP_POSTAL_CODE || "";
  if (!addressLine || !city || !postalCode) return null;

  const { firstName, lastName } = splitName(
    process.env.SHOP_SHIP_NAME || process.env.SHOP_NAME || "Holm Graphics",
  );

  return {
    firstName,
    lastName,
    email: process.env.SHOP_ETRANSFER_EMAIL || "",
    addressLine,
    addressLine2: process.env.SHOP_SHIP_ADDRESS_2 || "",
    city,
    province: process.env.SHOP_SHIP_PROVINCE || "ON",
    postalCode,
    country: process.env.SHOP_SHIP_COUNTRY || "CA",
    phone: process.env.SHOP_SHIP_PHONE || process.env.SHOP_PHONE || "",
  };
}

/**
 * Who pays the trade printer: always the shop, never the candidate.
 *
 * The candidate is buying from Holm Graphics, not from SinaLite, and must never
 * see a trade price — which is exactly what putting their details in the
 * billing block would arrange.
 */
export function shopBillTo(): BillTo | null {
  const shop = shopShipTo();
  if (!shop) return null;

  const { firstName, lastName } = splitName(
    process.env.SHOP_BILLING_NAME || process.env.SHOP_SHIP_NAME || process.env.SHOP_NAME || "",
  );

  return {
    ...shop,
    firstName: firstName || shop.firstName,
    lastName: lastName || shop.lastName,
    email: process.env.SHOP_BILLING_EMAIL || shop.email,
  };
}

/** The candidate, when an order is going straight to them. */
export function candidateShipTo(order: {
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
}): ShipTo {
  const { firstName, lastName } = splitName(order.contactName);

  return {
    firstName,
    lastName,
    email: order.email,
    addressLine: order.addressLine,
    addressLine2: "",
    city: order.city,
    // The portal does not ask for a province: every candidate on it is running
    // in an Ontario municipality. Revisit if that stops being true.
    province: "ON",
    postalCode: order.postalCode,
    country: "CA",
    phone: order.phone,
  };
}
