/**
 * What SinaLite calls things.
 *
 * src/lib/shop/vendor-map.ts has to hold their product ids and option values,
 * and those cannot be guessed — they come from their own catalogue. This prints
 * them.
 *
 *   npm run sinalite:catalog                  every product, filtered by name
 *   npm run sinalite:catalog -- --find card   products whose name matches
 *   npm run sinalite:catalog -- --product 42  one product's option groups
 *
 * Read-only: it lists and reads, and never prices or orders anything. Needs
 * SINALITE_CLIENT_ID and SINALITE_CLIENT_SECRET in the environment, and talks
 * to the sandbox unless SINALITE_ENV=live.
 */

import { fetchProductOptions, fetchProducts, sinaliteConfig } from "../src/lib/shop/sinalite";

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
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

  const productId = arg("product");
  if (productId) {
    const { options, combinations, meta } = await fetchProductOptions(productId);
    console.log("--- options -------------------------------------------------");
    console.dir(options, { depth: 6 });
    console.log("\n--- pricing combinations (first few) ------------------------");
    console.dir(Array.isArray(combinations) ? combinations.slice(0, 5) : combinations, {
      depth: 4,
    });
    console.log("\n--- meta ----------------------------------------------------");
    console.dir(meta, { depth: 4 });
    console.log(
      "\nPut the product id and the option values you want into src/lib/shop/vendor-map.ts.",
    );
    return;
  }

  const find = (arg("find") ?? "").toLowerCase();
  const products = await fetchProducts();
  const shown = find
    ? products.filter((p) => p.name.toLowerCase().includes(find))
    : products;

  for (const product of shown) {
    console.log(`${product.id.padEnd(8)} ${product.name}${product.category ? `  (${product.category})` : ""}`);
  }
  console.log(`\n${shown.length} of ${products.length} products.`);
  console.log("Then: npm run sinalite:catalog -- --product <id>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
