import type { ShipTo } from "./sinalite";

/**
 * Which of our products SinaLite prints, and what they call them.
 *
 * Two catalogues have to be lined up: ours, which is written for a candidate
 * ("4.25 × 11 door hanger, uncoated write-on panel"), and theirs, which is
 * written for a printer and keyed by ids. This file is the whole of that
 * translation, so a change at their end is one table to update rather than a
 * hunt through the ordering code.
 *
 * THE IDS ARE NOT FILLED IN YET. They cannot be guessed — they come from
 * SinaLite's own product list. Run `npm run sinalite:catalog` once credentials
 * are in the environment; it prints their products and each product's option
 * groups in the shape this table wants. Until an entry has a productId, the
 * queue shows the line as unmapped and refuses to send it, which is the safe
 * failure: a job sent with the wrong product id is a job printed wrong.
 */

export type VendorLineMapping = {
  /** Their product id. Empty means this line is not mapped yet. */
  productId: string;
  /** Their option values that are the same on every order of this variant. */
  fixedOptions: Record<string, string>;
  /**
   * Our option group and value, to their option value.
   * `{ finish: { GLOSS: "<their id>", MATTE: "<their id>" } }`
   */
  optionValues: Record<string, Record<string, string>>;
};

const SINALITE: Record<string, Record<string, VendorLineMapping>> = {
  "post-cards": {
    "4x6": { productId: "", fixedOptions: {}, optionValues: { finish: {} } },
    "5x7": { productId: "", fixedOptions: {}, optionValues: { finish: {} } },
  },
  "door-hangers": {
    "4.25x11": { productId: "", fixedOptions: {}, optionValues: { writeArea: {} } },
    "3.5x8.5": { productId: "", fixedOptions: {}, optionValues: { writeArea: {} } },
  },
};

/** True for products bought in rather than printed in the shop. */
export function isVendorProduct(productSlug: string): boolean {
  return productSlug in SINALITE;
}

export function vendorMappingFor(
  productSlug: string,
  variantKey: string,
): VendorLineMapping | null {
  return SINALITE[productSlug]?.[variantKey] ?? null;
}

export type ResolvedVendorLine =
  | { ok: true; productId: string; options: Record<string, string> }
  | { ok: false; problem: string };

/**
 * Turn one of our configured lines into theirs.
 *
 * Refuses rather than guesses. An option we cannot translate would otherwise be
 * dropped and the job printed with their default — gloss instead of uncoated,
 * say — which nobody would notice until a box of the wrong thing arrived.
 */
export function resolveVendorLine(
  productSlug: string,
  variantKey: string,
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

  const options: Record<string, string> = { ...mapping.fixedOptions };

  for (const [group, values] of Object.entries(mapping.optionValues)) {
    const ourValue = chosen[group];
    if (!ourValue) continue;

    const theirValue = values[ourValue];
    if (!theirValue) {
      return {
        ok: false,
        problem: `No SinaLite option for ${group} = ${ourValue}. Add it to src/lib/shop/vendor-map.ts.`,
      };
    }
    options[group] = theirValue;
  }

  return { ok: true, productId: mapping.productId, options };
}

/**
 * Where the trade printer ships to.
 *
 * A delivered order goes straight to the candidate — blind, in the shop's name.
 * A pickup order has to come to the shop, and the shop's address is structured
 * in the environment rather than parsed out of the free-text one on the
 * footer, because a courier label is not the place to be clever.
 */
export function shopShipTo(): ShipTo | null {
  const addressLine = process.env.SHOP_SHIP_ADDRESS || "";
  const city = process.env.SHOP_SHIP_CITY || "";
  const postalCode = process.env.SHOP_SHIP_POSTAL_CODE || "";
  if (!addressLine || !city || !postalCode) return null;

  return {
    name: process.env.SHOP_SHIP_NAME || process.env.SHOP_NAME || "Holm Graphics",
    addressLine,
    city,
    province: process.env.SHOP_SHIP_PROVINCE || "ON",
    postalCode,
    country: process.env.SHOP_SHIP_COUNTRY || "CA",
    phone: process.env.SHOP_SHIP_PHONE || process.env.SHOP_PHONE || "",
  };
}
