"use server";

import { revalidatePath } from "next/cache";
import { requireShopStaff } from "@/lib/shop/auth";
import {
  callFirstWorking,
  parsePricing,
  parseProduct,
  pricingEnvelope,
  productEnvelope,
  sanmarConfig,
  soapFault,
} from "@/lib/shop/sanmar";
import { catalogueStyles, syncSanmarStyles, type SyncReport } from "@/lib/shop/sanmar-sync";

/**
 * The supplier buttons on /shop/suppliers.
 *
 * These exist because the shop has no terminal and, more to the point, because
 * a development container cannot reach SanMar at all. Running the same code as
 * a server action means it runs inside the Railway deployment, which can.
 *
 * Staff only, and nothing here takes a parameter that reaches SanMar: the
 * styles come from the catalogue, so a hand-made request cannot aim these at
 * something else.
 */

export type ProbeResult = {
  configured: boolean;
  environment: string;
  fobId: string;
  style: string;
  productUrl: string;
  pricingUrl: string;
  /** What happened, in the order it happened, for somebody reading it cold. */
  lines: string[];
  ok: boolean;
};

/** Does SanMar answer, and what do they say? One style, nothing written. */
export async function probeSanmar(): Promise<ProbeResult> {
  await requireShopStaff();

  const config = sanmarConfig();
  const style = catalogueStyles()[0] ?? "ATC1000";
  const result: ProbeResult = {
    configured: config.configured,
    environment: config.environment,
    fobId: config.fobId,
    style,
    productUrl: config.productUrls[0] ?? "",
    pricingUrl: config.pricingUrls[0] ?? "",
    lines: [],
    ok: false,
  };

  if (!config.configured) {
    result.lines.push(
      "SANMAR_USERNAME and SANMAR_PASSWORD are not set on this service. They are " +
        "set on holmgraphics-shop-api — copy them across in Railway.",
    );
    return result;
  }

  const productResults = await callFirstWorking(config.productUrls, "", productEnvelope(style));
  const product = productResults.find((r) => r.ok);
  if (!product) {
    for (const attempt of productResults) {
      result.lines.push(
        `Product data did not answer: ${attempt.error ?? `HTTP ${attempt.status}`}`,
      );
    }
    return result;
  }

  const productFault = soapFault(product.body);
  if (productFault) {
    result.lines.push(`Product data answered with a fault: ${productFault}`);
    return result;
  }

  const parsed = parseProduct(product.body, style);
  result.lines.push(
    `Product data: ${parsed.name || style} — ${parsed.parts.length} colour and size ` +
      `combinations.`,
  );
  if (parsed.parts.length === 0) {
    result.lines.push("No parts came back, so the response shape has changed.");
    return result;
  }

  const pricingResults = await callFirstWorking(config.pricingUrls, "", pricingEnvelope(style));
  const pricing = pricingResults.find((r) => r.ok);
  if (!pricing) {
    for (const attempt of pricingResults) {
      result.lines.push(`Pricing did not answer: ${attempt.error ?? `HTTP ${attempt.status}`}`);
    }
    return result;
  }

  const pricingFault = soapFault(pricing.body);
  if (pricingFault) {
    result.lines.push(`Pricing answered with a fault: ${pricingFault}`);
    return result;
  }

  const costs = parsePricing(pricing.body);
  if (costs.size === 0) {
    result.lines.push("Pricing answered, but no costs could be read out of it.");
    return result;
  }

  const cheapest = Math.min(...costs.values());
  result.lines.push(
    `Pricing: ${costs.size} priced parts, cheapest $${(cheapest / 100).toFixed(2)} cost.`,
  );
  result.ok = true;
  return result;
}

/** Load every style the catalogue names. */
export async function syncSanmar(): Promise<SyncReport> {
  await requireShopStaff();
  const report = await syncSanmarStyles();
  revalidatePath("/shop/suppliers");
  revalidatePath("/election");
  return report;
}
