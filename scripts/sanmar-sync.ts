/**
 * Pull garment colours, sizes and costs from SanMar into the database.
 *
 *   railway run npm run sanmar:sync                    # every style the catalogue names
 *   railway run npm run sanmar:sync -- ATC1000 S365    # just these
 *   railway run npm run sanmar:sync -- --dry-run
 *
 * Run it where the network reaches SanMar. Writes the same rows the CSV
 * importer does, so the storefront cannot tell which way the data arrived.
 * Start with npm run sanmar:probe: this is worth running once that answers.
 */

import { PRODUCTS } from "../src/lib/shop/catalog";
import { fetchStyle } from "../src/lib/shop/sanmar";
import { importGarmentRows } from "../src/lib/shop/garment-import";
import { garmentRetailCents } from "../src/lib/shop/garments";

/** Every style the catalogue names, so the two cannot drift apart. */
function catalogueStyles(): string[] {
  return [
    ...new Set(
      PRODUCTS.flatMap((product) =>
        product.variants.map((variant) => variant.garmentStyleCode).filter((code): code is string => Boolean(code)),
      ),
    ),
  ];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const styles = named.length > 0 ? named.map((s) => s.toUpperCase()) : catalogueStyles();

  console.log(`Syncing ${styles.length} styles: ${styles.join(", ")}\n`);

  for (const style of styles) {
    const { rows, problems } = await fetchStyle(style);
    for (const problem of problems) console.log(`  ${style}: ${problem}`);

    if (rows.length === 0) {
      console.log(`  ${style}: nothing to import\n`);
      continue;
    }

    const colours = new Set(rows.map((r) => r.colourName)).size;
    const cheapest = Math.min(...rows.map((r) => r.costCents));
    console.log(
      `  ${style}: ${rows.length} sizes across ${colours} colours, from $${(cheapest / 100).toFixed(2)} cost` +
        ` → $${(garmentRetailCents(cheapest) / 100).toFixed(2)} retail`,
    );

    if (!dryRun) {
      const report = await importGarmentRows(rows, "SANMAR_API");
      console.log(`  ${style}: imported ${report.skus} sizes`);
    }
    console.log("");
  }

  if (dryRun) console.log("Dry run — nothing written.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
