/**
 * Does SanMar answer, and what do they say?
 *
 * Run this WHERE THE NETWORK REACHES SANMAR — on Railway, not on a laptop
 * behind a firewall:
 *
 *   railway run npm run sanmar:probe            # ATC1000 by default
 *   railway run npm run sanmar:probe -- S365
 *   railway run npm run sanmar:probe -- ATC1000 --raw
 *
 * It calls the configured endpoints, reports whether they answered, and shows
 * what came back — parsed if the shape was understood, raw if it was not.
 * Nothing is written to the database.
 *
 * The endpoints are no longer guesses (see src/lib/shop/sanmar.ts), so this is
 * now a diagnostic rather than a discovery: run it when the sync stops working,
 * or after SanMar change something, and it says where it broke.
 *
 * Passwords are never printed, including inside the raw output. The account
 * number is: it is on the invoices, and blanking a five-digit number out of a
 * raw XML dump would also blank out part ids and prices.
 */

import {
  callFirstWorking,
  parsePricing,
  parseProduct,
  pricingEnvelope,
  productEnvelope,
  SANMAR_WAREHOUSES,
  sanmarConfig,
  soapFault,
} from "../src/lib/shop/sanmar";

function redact(text: string): string {
  const { password, mediaPassword } = sanmarConfig();
  let out = text;
  for (const secret of [password, mediaPassword]) {
    if (secret) out = out.split(secret).join("«redacted»");
  }
  return out;
}

async function main() {
  const style = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "ATC1000")
    .trim()
    .toUpperCase();
  const raw = process.argv.includes("--raw");

  const config = sanmarConfig();
  console.log(`SanMar probe — style ${style}, ${config.environment}`);
  console.log(`  credentials: ${config.configured ? "set" : "MISSING (SANMAR_USERNAME / SANMAR_PASSWORD)"}`);
  console.log(`  media password: ${config.mediaPassword ? "set" : "not set"}`);
  console.log(
    `  quoting from FOB ${config.fobId} (${SANMAR_WAREHOUSES[config.fobId] ?? "unknown warehouse"})` +
      ` in ${config.currency}, ${config.priceType}/${config.configurationType}\n`,
  );

  if (!config.configured) process.exit(1);

  /* ---------------------------------------------------------- product data */
  console.log("PRODUCT DATA");
  const productResults = await callFirstWorking(
    config.productUrls,
    "",
    productEnvelope(style),
  );
  for (const result of productResults) {
    console.log(
      `  ${result.ok ? "OK  " : "fail"} ${result.url}` +
        `  ${result.status || ""} ${result.error ? `(${result.error})` : ""} ${result.contentType}`,
    );
  }

  const product = productResults.find((r) => r.ok);
  if (product) {
    const fault = soapFault(product.body);
    if (fault) console.log(`  SOAP fault: ${redact(fault)}`);

    const parsed = parseProduct(product.body, style);
    console.log(`  name: ${parsed.name || "(not found)"}   brand: ${parsed.brand || "(not found)"}`);
    console.log(`  parts: ${parsed.parts.length}`);
    for (const part of parsed.parts.slice(0, 6)) {
      console.log(
        `    ${part.partId.padEnd(10)} ${part.colourName.padEnd(20)} ${part.size.padEnd(6)} ${part.colourCode}`,
      );
    }
    if (parsed.parts.length > 6) console.log(`    … and ${parsed.parts.length - 6} more`);
    if (raw || parsed.parts.length === 0) {
      console.log("\n  --- raw, first 2000 characters ---");
      console.log(redact(product.body).slice(0, 2000));
      console.log("  --- end ---");
    }
  }

  /* --------------------------------------------------------------- pricing */
  console.log("\nPRICING");
  const pricingResults = await callFirstWorking(
    config.pricingUrls,
    "",
    pricingEnvelope(style),
  );
  for (const result of pricingResults) {
    console.log(
      `  ${result.ok ? "OK  " : "fail"} ${result.url}` +
        `  ${result.status || ""} ${result.error ? `(${result.error})` : ""} ${result.contentType}`,
    );
  }

  const pricing = pricingResults.find((r) => r.ok);
  if (pricing) {
    const fault = soapFault(pricing.body);
    if (fault) console.log(`  SOAP fault: ${redact(fault)}`);

    const costs = parsePricing(pricing.body);
    console.log(`  priced parts: ${costs.size}`);
    for (const [partId, cents] of [...costs].slice(0, 6)) {
      console.log(`    ${partId.padEnd(10)} $${(cents / 100).toFixed(2)}`);
    }
    if (raw || costs.size === 0) {
      console.log("\n  --- raw, first 2000 characters ---");
      console.log(redact(pricing.body).slice(0, 2000));
      console.log("  --- end ---");
    }
  }

  console.log(
    "\nBoth answered with parts and prices? Run `npm run sanmar:sync` to load them.\n" +
      "Neither answered? Check SANMAR_ENV (uat or production) before anything else —\n" +
      "production credentials against the UAT endpoints fail exactly like a wrong URL.\n" +
      "SANMAR_PRODUCT_URL / SANMAR_PRICING_URL override the built-in endpoints if SanMar\n" +
      "have moved them; darrenholm/holmgraphics-shop-api is where the current ones live.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
