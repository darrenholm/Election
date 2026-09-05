/**
 * What SinaLite calls things.
 *
 * src/lib/shop/vendor-map.ts has to hold their product ids and option ids, and
 * those cannot be guessed — they come from their own catalogue. This prints
 * them in the shape that table wants.
 *
 *   npm run sinalite:catalog                     every product
 *   npm run sinalite:catalog -- --find "post"    products whose name matches
 *   npm run sinalite:catalog -- --product 42     one product's option groups
 *   npm run sinalite:catalog -- --variants 42    its priced combinations
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
  const shown = find ? products.filter((p) => p.name.toLowerCase().includes(find)) : products;

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
