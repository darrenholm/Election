import { PRODUCTS } from "./catalog";
import { fetchStyle, sanmarConfig } from "./sanmar";
import { importGarmentRows } from "./garment-import";
import { garmentRetailCents } from "./garments";

/**
 * Pulling garment data from SanMar, as a function rather than a script.
 *
 * It lives here rather than in scripts/ because the shop has no terminal. The
 * command-line version needs a clone of this repository, node_modules, the
 * Railway CLI and a linked project; the button on /shop/suppliers needs a
 * browser. Both call this, so neither can drift from the other.
 *
 * It also has to run somewhere the network reaches SanMar, which the deployed
 * app does and a development container does not — another reason for the
 * button: pressing it runs this inside the Railway deployment.
 */

/** Every style the catalogue names, so the two cannot drift apart. */
export function catalogueStyles(): string[] {
  return [
    ...new Set(
      PRODUCTS.flatMap((product) =>
        product.variants
          .map((variant) => variant.garmentStyleCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ),
  ];
}

export type StyleSyncResult = {
  styleCode: string;
  /** How many size/colour rows came back priced. */
  skus: number;
  colours: number;
  /** The cheapest garment in the style, and what it would sell for. */
  fromCostCents: number | null;
  fromRetailCents: number | null;
  /** Anything worth telling a human: faults, unpriced parts, an empty answer. */
  problems: string[];
  imported: boolean;
};

export type SyncReport = {
  configured: boolean;
  environment: string;
  results: StyleSyncResult[];
  /** True when at least one style came back with prices. */
  anyPriced: boolean;
};

/**
 * Refresh some or all of the styles the catalogue names.
 *
 * A style that comes back empty is reported and skipped, never imported: an
 * empty import would delete the sizes that are already there and take the
 * apparel offline, which is a worse outcome than stale costs.
 */
export async function syncSanmarStyles(
  options: { styles?: string[]; dryRun?: boolean } = {},
): Promise<SyncReport> {
  const config = sanmarConfig();
  const styles = (options.styles?.length ? options.styles : catalogueStyles()).map((s) =>
    s.toUpperCase(),
  );

  const report: SyncReport = {
    configured: config.configured,
    environment: config.environment,
    results: [],
    anyPriced: false,
  };

  if (!config.configured) return report;

  for (const styleCode of styles) {
    const { rows, problems } = await fetchStyle(styleCode);

    if (rows.length === 0) {
      report.results.push({
        styleCode,
        skus: 0,
        colours: 0,
        fromCostCents: null,
        fromRetailCents: null,
        problems: problems.length > 0 ? problems : ["Nothing came back."],
        imported: false,
      });
      continue;
    }

    const cheapest = Math.min(...rows.map((r) => r.costCents));
    let imported = false;
    const noted = [...problems];

    if (!options.dryRun) {
      try {
        await importGarmentRows(rows, "SANMAR_API");
        imported = true;
      } catch (error) {
        noted.push(error instanceof Error ? error.message : String(error));
      }
    }

    report.anyPriced = true;
    report.results.push({
      styleCode,
      skus: rows.length,
      colours: new Set(rows.map((r) => r.colourName)).size,
      fromCostCents: cheapest,
      fromRetailCents: garmentRetailCents(cheapest),
      problems: noted,
      imported,
    });
  }

  return report;
}
