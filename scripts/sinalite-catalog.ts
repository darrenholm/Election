/**
 * What SinaLite calls things.
 *
 * src/lib/shop/vendor-map.ts has to hold their product ids and option ids, and
 * those cannot be guessed — they come from their own catalogue. This prints
 * them in the shape that table wants.
 *
 *   npm run sinalite:catalog -- --suggest        candidates for what is unmapped
 *   npm run sinalite:catalog                     every product
 *   npm run sinalite:catalog -- --find "post"    products whose name or sku matches
 *   npm run sinalite:catalog -- --product 42     one product's option groups
 *   npm run sinalite:catalog -- --variants 42    its priced combinations
 *
 * Start with --suggest: it takes every entry in the vendor map that still has
 * no product id and prints the products whose names look like it.
 *
 * Read-only: it lists and reads, and never orders anything. Needs
 * SINALITE_CLIENT_ID and SINALITE_CLIENT_SECRET set, and talks to the sandbox
 * unless SINALITE_ENV=live.
 */

import {
  fetchProductOptions,
  fetchProducts,
  fetchVariants,
  sinaliteConfig,
} from "../src/lib/shop/sinalite";
import { unmappedEntries } from "../src/lib/shop/vendor-map";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const config = sinaliteConfig();
  if (!config.configured) {
    console.error(
      "SINALITE_CLIENT_ID and SINALITE_CLIENT_SECRET are not set, so there is nothing to ask.",
    );
    process.exit(1);
  }

  console.log(`${config.host}, store ${config.store}\n`);

  if (process.argv.includes("--suggest")) {
    const products = await fetchProducts();
    const unmapped = unmappedEntries();

    if (unmapped.length === 0) {
      console.log("Everything in src/lib/shop/vendor-map.ts already has a product id.");
      return;
    }

    // One product usually serves several of our cuts, so the same hint appears
    // more than once; the candidates are printed per hint rather than per cut.
    const seen = new Set<string>();
    for (const entry of unmapped) {
      const hint = entry.mapping.productHint;
      const fingerprint = hint.nameContains.join("|");
      const cuts = unmapped
        .filter((other) => other.mapping.productHint.nameContains.join("|") === fingerprint)
        .map((other) => `${other.productSlug}/${other.variantKey}`);

      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      console.log(`${cuts.join(", ")}`);
      console.log(`    wanted: ${hint.url}`);

      const candidates = products.filter((product) => {
        const haystack = `${product.name} ${product.sku}`.toLowerCase();
        return hint.nameContains.every((word) => haystack.includes(word.toLowerCase()));
      });

      if (candidates.length === 0) {
        console.log("    no product matched every word — try --find with one word\n");
        continue;
      }
      for (const candidate of candidates) {
        console.log(`    ${candidate.id.padEnd(6)} ${candidate.name}  [${candidate.sku}]`);
      }
      console.log("");
    }

    console.log("Confirm the id against the URL, then: --product <id> for its option ids.");
    return;
  }

  const variantsOf = arg("variants");
  if (variantsOf) {
    const variants = await fetchVariants(variantsOf);
    for (const variant of variants) {
      console.log(`${variant.key.padEnd(28)} ${money(variant.priceCents)}`);
    }
    console.log(`\n${variants.length} priced combinations.`);
    console.log(
      "A key is the chosen option ids in ascending order. Cross it against the option list\n" +
        "from --product to see which run and which stock each price belongs to.",
    );
    return;
  }

  const productId = arg("product");
  if (productId) {
    const { options, meta } = await fetchProductOptions(productId);

    // Grouped, because that is how the mapping table is written: a group name
    // and the id of the value wanted within it.
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const option of options) {
      const list = groups.get(option.group) ?? [];
      list.push({ id: option.id, name: option.name });
      groups.set(option.group, list);
    }

    for (const [group, values] of groups) {
      console.log(`${group}`);
      for (const value of values) console.log(`    ${value.id.padEnd(8)} ${value.name}`);
      console.log("");
    }

    const quantities = groups.get("qty") ?? [];
    if (quantities.length > 0) {
      console.log("quantityOptions for src/lib/shop/vendor-map.ts:");
      console.log(
        `    { ${quantities
          .slice()
          .sort((a, b) => Number(a.name) - Number(b.name))
          .map((q) => `${q.name}: "${q.id}"`)
          .join(", ")} }\n`,
      );
    }

    console.log("meta:");
    console.dir(meta, { depth: 4 });
    console.log(
      "\nEvery group needs a value in the mapping — Turnaround and Stock included, since\n" +
        "there is no default at their end.",
    );
    return;
  }

  const find = (arg("find") ?? "").toLowerCase();
  const products = await fetchProducts();
  const shown = find
    ? products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(find))
    : products;

  for (const product of shown) {
    console.log(
      `${product.id.padEnd(6)} ${product.name.padEnd(48)} ${product.category}${
        product.enabled ? "" : "  (enabled: 0)"
      }`,
    );
  }
  console.log(`\n${shown.length} of ${products.length} products.`);
  console.log("Then: npm run sinalite:catalog -- --product <id>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
