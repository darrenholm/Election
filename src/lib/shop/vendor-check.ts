import { PRODUCTS, productBySlug } from "./catalog";
import { isVendorProduct, vendorMappingFor, vendorProductSlugs } from "./vendor-map";

/**
 * Does the catalogue still agree with the vendor map?
 *
 * Adding a trade-printed product means editing two files: catalog.ts, which is
 * what a candidate sees and pays, and vendor-map.ts, which is what the trade
 * printer is told. Nothing forces them to agree, and a disagreement is
 * invisible until somebody orders — the queue refuses to send the job, days
 * after the money was taken.
 *
 * So this reads both and says what does not line up. It needs no credentials
 * and touches no network: it is the one check that can be run before an account
 * exists, which is exactly when a new product is being added.
 *
 *     npm run sinalite:check
 */

export type VendorProblem = { where: string; problem: string };

export function checkVendorMap(): VendorProblem[] {
  const problems: VendorProblem[] = [];

  for (const slug of vendorProductSlugs()) {
    const product = productBySlug(slug);
    if (!product) {
      problems.push({
        where: slug,
        problem: "In the vendor map but not in the catalogue — nothing can order it.",
      });
      continue;
    }

    // Their quantity is an option id, so a run the catalogue offers but the
    // map cannot name is a run that will be refused at send time.
    if (!product.quantitiesFixed) {
      problems.push({
        where: slug,
        problem:
          "Trade printed but quantitiesFixed is not set — the storefront would offer runs the printer does not sell.",
      });
    }

    for (const variant of product.variants) {
      const mapping = vendorMappingFor(slug, variant.key);
      if (!mapping) {
        problems.push({
          where: `${slug}/${variant.key}`,
          problem: "In the catalogue but not in the vendor map — it could be ordered and never sent.",
        });
        continue;
      }

      // Everything below only makes sense once the ids are filled in; an
      // unmapped entry is a known state, not a mistake.
      if (!mapping.productId) continue;

      const runs = Object.keys(mapping.quantityOptions).map(Number);
      for (const step of variant.breaks) {
        if (!runs.includes(step.quantity)) {
          problems.push({
            where: `${slug}/${variant.key}`,
            problem: `The catalogue sells ${step.quantity} but the map has no qty option id for it — they run ${runs.join(", ") || "nothing yet"}.`,
          });
        }
      }
      if (runs.length === 0) {
        problems.push({
          where: `${slug}/${variant.key}`,
          problem: "Has a product id but no quantity option ids, so every order of it is refused.",
        });
      }

      // An option group in the map that the catalogue no longer offers is dead
      // weight; a value missing from it is a job printed with their default.
      for (const groupKey of Object.keys(mapping.optionValues)) {
        const group = product.options.find((g) => g.key === groupKey);
        if (!group) {
          problems.push({
            where: `${slug}/${variant.key}`,
            problem: `Maps an option group "${groupKey}" the catalogue does not have.`,
          });
          continue;
        }
        for (const choice of group.choices) {
          if (!mapping.optionValues[groupKey][choice.value]) {
            problems.push({
              where: `${slug}/${variant.key}`,
              problem: `No SinaLite option for ${groupKey} = ${choice.value}, which the catalogue offers.`,
            });
          }
        }
      }
    }
  }

  // The other direction: a product marked as fixed-quantity but bought nowhere
  // is either a mistake or a leftover.
  for (const product of PRODUCTS) {
    if (product.quantitiesFixed && !isVendorProduct(product.slug)) {
      problems.push({
        where: product.slug,
        problem: "quantitiesFixed is set but nothing trade prints it — printed in the shop, so any quantity is sellable.",
      });
    }
  }

  return problems;
}
