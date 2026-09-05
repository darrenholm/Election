/**
 * Load garment costs, colours and sizes from a CSV.
 *
 *   npm run garments:import -- ~/Downloads/sanmar-export.csv
 *   npm run garments:import -- export.csv --dry-run
 *
 * Takes an export from SanMar's dealer portal — or any spreadsheet saved as
 * CSV — and puts it where the storefront reads from. Column names are matched
 * loosely, because no two exports call things the same: style / style number /
 * styleCode, colour / color / colour name, size, cost / net / price.
 *
 * Needs no credentials, which is the point: it is how apparel goes live before
 * the SanMar API is wired, and how a one-off price change gets in afterwards.
 */

import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { importGarmentRows, type GarmentRow } from "../src/lib/shop/garment-import";
import { garmentRetailCents } from "../src/lib/shop/garments";

/** Match a column however the export happens to spell it. */
function pick(row: Record<string, string>, names: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    const cleaned = key.toLowerCase().replace(/[^a-z]/g, "");
    if (names.includes(cleaned)) return (value ?? "").trim();
  }
  return "";
}

function toCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("Usage: npm run garments:import -- <file.csv> [--dry-run]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");

  const parsed = Papa.parse<Record<string, string>>(readFileSync(file, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });

  const rows: GarmentRow[] = parsed.data.map((row) => ({
    styleCode: pick(row, ["style", "stylecode", "stylenumber", "styleno", "sku", "productid"]),
    brand: pick(row, ["brand", "mill", "manufacturer"]),
    name: pick(row, ["name", "productname", "styledescription", "title"]),
    description: pick(row, ["description", "longdescription"]),
    colourName: pick(row, ["colour", "color", "colourname", "colorname"]),
    colourCode: pick(row, ["colourcode", "colorcode", "colourid", "colorid"]),
    size: pick(row, ["size", "sizename"]),
    costCents: toCents(pick(row, ["cost", "net", "netcost", "price", "dealerprice", "yourprice"])),
  }));

  console.log(`${file}: ${rows.length} rows`);

  if (dryRun) {
    // Show what it would do, priced, so a wrong cost column is obvious before
    // anything is written — a mis-picked column would put every shirt on the
    // storefront at the wrong price.
    const sample = rows.slice(0, 8);
    for (const row of sample) {
      console.log(
        `  ${(row.styleCode || "?").padEnd(10)} ${(row.colourName || "?").padEnd(18)} ${(row.size || "?").padEnd(5)}` +
          ` cost $${(row.costCents / 100).toFixed(2).padStart(7)}  ->  $${(garmentRetailCents(row.costCents) / 100).toFixed(2)}`,
      );
    }
    if (rows.length > sample.length) console.log(`  … and ${rows.length - sample.length} more`);
    console.log("\nDry run — nothing written. Drop --dry-run to import.");
    return;
  }

  const report = await importGarmentRows(rows, "CSV");
  console.log(`Imported ${report.skus} sizes across ${report.styles} styles.`);
  for (const skip of report.skipped.slice(0, 20)) {
    console.log(`  skipped row ${skip.row}: ${skip.why}`);
  }
  if (report.skipped.length > 20) console.log(`  … and ${report.skipped.length - 20} more skipped`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
