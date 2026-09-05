/**
 * Pull garment colours, sizes and costs from SanMar into the database.
 *
 *   railway run npm run sanmar:sync                    # every style the catalogue names
 *   railway run npm run sanmar:sync -- ATC1000 S365    # just these
 *   railway run npm run sanmar:sync -- --dry-run
 *
 * Run it where the network reaches SanMar. `railway run` executes on *this*
 * machine with Railway's variables injected, so it needs a clone of this
 * repository, node_modules and a linked project — if that is not set up, the
 * button on /shop/suppliers does the same thing inside the deployment.
 *
 * Writes the same rows the CSV importer does, so the storefront cannot tell
 * which way the data arrived.
 */

import { syncSanmarStyles } from "../src/lib/shop/sanmar-sync";

function money(cents: number | null): string {
  return cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  const report = await syncSanmarStyles({ styles: named, dryRun });

  if (!report.configured) {
    console.error(
      "SANMAR_USERNAME and SANMAR_PASSWORD are not set here. They are set on the\n" +
        "holmgraphics-shop-api service in Railway — copy them onto this app's service.",
    );
    process.exit(1);
  }

  console.log(`SanMar ${report.environment} — ${report.results.length} styles\n`);

  for (const result of report.results) {
    for (const problem of result.problems) console.log(`  ${result.styleCode}: ${problem}`);
    if (result.skus === 0) {
      console.log(`  ${result.styleCode}: nothing to import\n`);
      continue;
    }
    console.log(
      `  ${result.styleCode}: ${result.skus} sizes across ${result.colours} colours,` +
        ` from ${money(result.fromCostCents)} cost → ${money(result.fromRetailCents)} retail` +
        `${result.imported ? " — imported" : ""}`,
    );
    console.log("");
  }

  if (dryRun) console.log("Dry run — nothing written.");
  if (!report.anyPriced) {
    console.error("Nothing came back priced. Run npm run sanmar:probe to see why.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
