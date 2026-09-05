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
 * It tries each candidate endpoint, reports which answered, and shows what came
 * back — parsed if the shape was understood, raw if it was not. Nothing is
 * written to the database. The point is to replace guesses with facts: whatever
 * this prints is what the adapter should be written against.
 *
 * Passwords are never printed, including inside the raw output.
 */

import {
  callFirstWorking,
  parsePricing,
  parseProduct,
  pricingEnvelope,
  productEnvelope,
  sanmarConfig,
  soapFault,
} from "../src/lib/shop/sanmar";

function redact(text: string): string {
  const { password, mediaPassword, username } = sanmarConfig();
  let out = text;
  for (const secret of [password, mediaPassword, username]) {
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
  console.log(`  customer number: ${config.customerNumber || "not set"}`);
  console.log(`  media password: ${config.mediaPassword ? "set" : "not set"}\n`);

  if (!config.configured) process.exit(1);

  /* ---------------------------------------------------------- product data */
  console.log("PRODUCT DATA");
  const productResults = await callFirstWorking(
    config.productUrls,
    "getProduct",
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
    "getConfigurationAndPricing",
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
    "\nIf an endpoint answered, put its URL in SANMAR_PRODUCT_URL / SANMAR_PRICING_URL so\n" +
      "nothing has to guess again. If none did, the URLs are wrong — SanMar's integration\n" +
      "documentation has them, and they differ between SanMar Canada and SanMar US.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
