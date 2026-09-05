/**
 * Do the SanMar parsers still read a SanMar response?
 *
 * Needs no credentials and no network, which is the point: the fragile part of
 * that adapter is not the HTTP, it is the shape of the document that comes
 * back. A field renamed in a refactor, a nesting level dropped, and the sync
 * quietly imports nothing — or worse, imports colours with no prices and every
 * shirt lands on the $12 floor looking deliberate.
 *
 * The fixtures below are the shapes SanMar Canada actually send, taken from
 * what darrenholm/holmgraphics-shop-api reads in production: the part id lives
 * on the Part and the prices hang off it in an array, the colour is in a
 * ColorArray with the hex under `hex`, and the pricing operation's response
 * element starts with a lowercase letter while the product one does not.
 *
 *   npm run sanmar:check
 *
 * This is not a substitute for `railway run npm run sanmar:probe`, which is the
 * only thing that proves the credentials and the endpoints. It is a substitute
 * for finding out that the parsers broke a week after they broke.
 */

import { parsePricing, parseProduct, pricingEnvelope, productEnvelope } from "../src/lib/shop/sanmar";

const PRODUCT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <ns1:GetProductResponse xmlns:ns1="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/">
      <ns1:Product>
        <ns1:productId>ATC1000</ns1:productId>
        <ns1:productName>ATC Everyday Cotton Tee</ns1:productName>
        <ns1:description>Ring spun cotton, unisex fit.</ns1:description>
        <ns1:productBrand>ATC</ns1:productBrand>
        <ns1:ProductPartArray>
          <ns1:ProductPart>
            <ns1:partId>ATC1000-BLK-M</ns1:partId>
            <ns1:ColorArray>
              <ns1:Color>
                <ns1:colorName>Black</ns1:colorName>
                <ns1:hex>000000</ns1:hex>
              </ns1:Color>
            </ns1:ColorArray>
            <ns1:ApparelSize>
              <ns1:apparelSize>M</ns1:apparelSize>
            </ns1:ApparelSize>
          </ns1:ProductPart>
          <ns1:ProductPart>
            <ns1:partId>ATC1000-BLK-XL</ns1:partId>
            <ns1:ColorArray>
              <ns1:Color>
                <ns1:colorName>Black</ns1:colorName>
                <ns1:hex>000000</ns1:hex>
              </ns1:Color>
            </ns1:ColorArray>
            <ns1:ApparelSize>
              <ns1:apparelSize>XL</ns1:apparelSize>
            </ns1:ApparelSize>
          </ns1:ProductPart>
        </ns1:ProductPartArray>
      </ns1:Product>
    </ns1:GetProductResponse>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

const PRICING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <ns1:getConfigurationAndPricingResponse xmlns:ns1="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/">
      <ns1:Configuration>
        <ns1:PartArray>
          <ns1:Part>
            <ns1:partId>ATC1000-BLK-M</ns1:partId>
            <ns1:PartPriceArray>
              <ns1:PartPrice>
                <ns1:minQuantity>1</ns1:minQuantity>
                <ns1:price>7.42</ns1:price>
                <ns1:priceUom>EA</ns1:priceUom>
              </ns1:PartPrice>
              <ns1:PartPrice>
                <ns1:minQuantity>144</ns1:minQuantity>
                <ns1:price>6.15</ns1:price>
                <ns1:priceUom>EA</ns1:priceUom>
              </ns1:PartPrice>
            </ns1:PartPriceArray>
          </ns1:Part>
          <ns1:Part>
            <ns1:partId>ATC1000-BLK-XL</ns1:partId>
            <ns1:PartPriceArray>
              <ns1:PartPrice>
                <ns1:minQuantity>1</ns1:minQuantity>
                <ns1:price>8.10</ns1:price>
                <ns1:priceUom>EA</ns1:priceUom>
              </ns1:PartPrice>
            </ns1:PartPriceArray>
          </ns1:Part>
        </ns1:PartArray>
      </ns1:Configuration>
    </ns1:getConfigurationAndPricingResponse>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

const problems: string[] = [];

function check(what: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ok    ${what}`);
  } else {
    problems.push(`${what}: expected ${b}, got ${a}`);
    console.log(`  FAIL  ${what}: expected ${b}, got ${a}`);
  }
}

console.log("Product data");
const product = parseProduct(PRODUCT_XML, "ATC1000");
check("name", product.name, "ATC Everyday Cotton Tee");
check("brand", product.brand, "ATC");
check("parts", product.parts.length, 2);
check("part id", product.parts[0]?.partId, "ATC1000-BLK-M");
check("colour name", product.parts[0]?.colourName, "Black");
check("colour code", product.parts[0]?.colourCode, "000000");
check("size", product.parts[0]?.size, "M");
check("second size", product.parts[1]?.size, "XL");

console.log("\nPricing");
const costs = parsePricing(PRICING_XML);
check("priced parts", costs.size, 2);
// The cheapest break, not the first: a campaign order reaches the bottom of a
// garment table and pricing every shirt as a single would put $1.27 on each.
check("lowest break wins", costs.get("ATC1000-BLK-M"), 615);
check("single break", costs.get("ATC1000-BLK-XL"), 810);

console.log("\nRequests");
const productRequest = productEnvelope("ATC1000");
const pricingRequest = pricingEnvelope("ATC1000");
check("product operation", /<ns:GetProductRequest\b/.test(productRequest), true);
// Lowercase 'g'. The standard is inconsistent between the two services and
// SanMar follow it exactly, so this is worth holding still.
check(
  "pricing operation",
  /<ns:getConfigurationAndPricingRequest\b/.test(pricingRequest),
  true,
);
// Every child in the service namespace. Putting the common fields in the
// standard's SharedObjects namespace is legal and SanMar reject it.
check("no SharedObjects prefix", /shar:/.test(productRequest + pricingRequest), false);
check("quotes the warehouse", /<ns:fobId>\d+<\/ns:fobId>/.test(pricingRequest), true);
check("asks for a blank garment", /<ns:configurationType>Blank</.test(pricingRequest), true);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s). The SanMar adapter will not read a real response.`);
  process.exit(1);
}
console.log("\nThe SanMar parsers still read a SanMar response.");
