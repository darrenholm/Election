import { XMLParser } from "fast-xml-parser";
import type { GarmentRow } from "./garment-import";

/**
 * SanMar Canada — where the garment data comes from.
 *
 * Their services are SOAP and implement the PromoStandards suite. Two of them
 * are used here:
 *
 *   Product data          colours, sizes, and the part ids that join the two
 *   Pricing and config    cost per part
 *
 * This was originally written from the standard's published shapes and a guess
 * at the endpoints. It is not any more: the endpoints, the envelope shape and
 * the fixed request values below are all taken from
 * darrenholm/holmgraphics-shop-api, which has been calling these same services
 * in production on the same SanMar account. Where the standard allows two ways
 * of doing something, this file does whichever one that service does, because
 * that is the one known to answer.
 *
 * `npm run sanmar:probe` still exists and is still the thing to run when
 * something stops working — it prints what came back, raw, from wherever it is
 * run. It has to run where the network reaches SanMar: on Railway, not in a
 * development container.
 *
 * Media content needs a separate password (SANMAR_MEDIA_PASSWORD) and is not
 * used yet — it is where product photography would come from.
 */

/* -------------------------------------------------------------------------
 * ENDPOINTS — not guesses.
 *
 * These are lifted from darrenholm/holmgraphics-shop-api, which has been
 * talking to SanMar Canada in production on the same account (#26562). Its
 * suppliers/sanmar/config.js cites the SanMar Canada PromoStandards Web
 * Services Integration Guide: UAT lives under /uat-ws/, production under
 * /pstd/, each service on its own versioned subpath. Nothing is on
 * sanmarcanada.com — the web services are on edi.atc-apparel.com.
 *
 * If they ever move, that repository is the place to look first: it is the
 * one with an account rep and a live order flow behind it.
 * ---------------------------------------------------------------------- */
const ENDPOINTS = {
  uat: {
    product:
      "https://edi.atc-apparel.com/uat-ws/promostandards/productdata2.0/ProductDataServiceV2.php",
    pricing:
      "https://edi.atc-apparel.com/uat-ws/promostandards/productpricingconfiguration/PricingAndConfigurationService.php",
  },
  production: {
    product: "https://edi.atc-apparel.com/pstd/productdata2.0/ProductDataServiceV2.php",
    pricing:
      "https://edi.atc-apparel.com/pstd/productpricingconfiguration/PricingAndConfigurationService.php",
  },
} as const;

/**
 * SanMar Canada's warehouses, by the FobId the pricing call asks for. 3 was
 * retired. Mississauga serves Ontario, so it is what we quote from.
 */
export const SANMAR_WAREHOUSES: Record<string, string> = {
  "1": "Vancouver",
  "2": "Mississauga",
  "4": "Calgary",
};

export type SanmarConfig = {
  configured: boolean;
  username: string;
  password: string;
  mediaPassword: string;
  environment: "uat" | "production";
  productUrls: string[];
  pricingUrls: string[];
  /** Which warehouse the prices are quoted from. */
  fobId: string;
  /** ISO code the prices come back in. */
  currency: string;
  /** SanMar Canada quotes 'Customer' against a 'Blank' configuration. */
  priceType: string;
  configurationType: string;
};

export function sanmarConfig(): SanmarConfig {
  const username = process.env.SANMAR_USERNAME || "";
  const password = process.env.SANMAR_PASSWORD || "";

  // The sibling service spells these 'uat' and 'production'. Keep the same
  // vocabulary so one variable can be copied between them without thinking
  // about it. Anything unrecognised is production: a wrong guess that fails to
  // authenticate is better than one that quietly prices off a test catalogue.
  const raw = (process.env.SANMAR_ENV || "production").toLowerCase();
  const environment: "uat" | "production" =
    raw === "uat" || raw === "sandbox" || raw === "test" ? "uat" : "production";

  const productUrl = process.env.SANMAR_PRODUCT_URL || "";
  const pricingUrl = process.env.SANMAR_PRICING_URL || "";

  return {
    configured: Boolean(username && password),
    username,
    password,
    // Media content has a password of its own — a SanMar quirk. Not used yet;
    // it is where product photography would come from.
    mediaPassword: process.env.SANMAR_MEDIA_PASSWORD || password,
    environment,
    productUrls: productUrl ? [productUrl] : [ENDPOINTS[environment].product],
    pricingUrls: pricingUrl ? [pricingUrl] : [ENDPOINTS[environment].pricing],
    fobId: process.env.SANMAR_FOB_ID || "2",
    currency: process.env.SANMAR_CURRENCY || "CAD",
    priceType: process.env.SANMAR_PRICE_TYPE || "Customer",
    configurationType: "Blank",
  };
}

/* ------------------------------------------------------------- envelopes -- */

const PRODUCT_NS = "http://www.promostandards.org/WSDL/ProductDataService/2.0.0/";
const PRICING_NS = "http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

/**
 * One request element, every child in the service's own namespace.
 *
 * The standard publishes a SharedObjects namespace for the common fields and
 * it is tempting to put wsVersion and id in it. SanMar's implementation does
 * not accept that. The shape below is what holmgraphics-shop-api sends in
 * production — one `ns:` prefix on everything — and it is what answers.
 */
function envelope(namespace: string, operation: string, fields: [string, string][]): string {
  const body = fields
    .map(([key, value]) => `      <ns:${key}>${escapeXml(value)}</ns:${key}>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:${operation}Request xmlns:ns="${namespace}">
${body}
    </ns:${operation}Request>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function productEnvelope(styleCode: string): string {
  const { username, password } = sanmarConfig();
  return envelope(PRODUCT_NS, "GetProduct", [
    ["wsVersion", "2.0.0"],
    ["id", username],
    ["password", password],
    ["localizationCountry", "CA"],
    ["localizationLanguage", "en"],
    ["productId", styleCode],
  ]);
}

export function pricingEnvelope(styleCode: string): string {
  const { username, password, currency, fobId, priceType, configurationType } = sanmarConfig();
  // Lowercase 'g'. The product service capitalises its operation and this one
  // does not — the standard is inconsistent and SanMar follow it exactly.
  return envelope(PRICING_NS, "getConfigurationAndPricing", [
    ["wsVersion", "1.0.0"],
    ["id", username],
    ["password", password],
    ["productId", styleCode],
    ["currency", currency],
    ["fobId", fobId],
    ["priceType", priceType],
    ["configurationType", configurationType],
    ["localizationCountry", "CA"],
    ["localizationLanguage", "en"],
  ]);
}

/* ------------------------------------------------------------------ call -- */

export type SoapResult = {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  error?: string;
};

/** One SOAP POST. Never throws: the probe wants to report failures, not die on them. */
export async function soapCall(
  url: string,
  soapAction: string,
  envelope: string,
): Promise<SoapResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        // Quoted, and empty by default. SanMar's stack routes on the request
        // element rather than this header, and a non-empty value it does not
        // recognise is answered with a 500 instead of a fault.
        SOAPAction: `"${soapAction}"`,
      },
      body: envelope,
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The first endpoint that answers at all, so the probe can say which works. */
export async function callFirstWorking(
  urls: string[],
  soapAction: string,
  envelope: string,
): Promise<SoapResult[]> {
  const results: SoapResult[] = [];
  for (const url of urls) {
    const result = await soapCall(url, soapAction, envelope);
    results.push(result);
    if (result.ok) break;
  }
  return results;
}

/* ----------------------------------------------------------------- parse -- */

// Namespace prefixes are stripped, so the shapes below read as the standard
// documents them rather than as whatever prefix SanMar happen to use.
// parseTagValue stays OFF. It would turn a colour hex of "000000" into the
// number 0 and "123456" into 123456, losing the leading zeros a hex needs, and
// nothing here wants the convenience: every field is either put through String
// or through Number explicitly a few lines below.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Dig out a key from anywhere in a parsed document, whatever it is wrapped in. */
function find(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  if (key in record) return record[key];

  for (const value of Object.values(record)) {
    const hit = find(value, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export type SanmarPart = {
  partId: string;
  colourName: string;
  colourCode: string;
  size: string;
};

export type SanmarProduct = {
  styleCode: string;
  name: string;
  brand: string;
  description: string;
  parts: SanmarPart[];
};

/** A SOAP fault's message, when the body carries one. */
export function soapFault(xml: string): string | null {
  if (!/fault/i.test(xml)) return null;
  const parsed = parser.parse(xml);
  const message =
    find(parsed, "faultstring") ?? find(parsed, "Message") ?? find(parsed, "description");
  return message === undefined ? "SOAP fault" : String(message);
}

export function parseProduct(xml: string, styleCode: string): SanmarProduct {
  const parsed = parser.parse(xml);

  const parts = asArray(find(parsed, "ProductPart") as Record<string, unknown>[]).map((part) => {
    const colour = (find(part, "Color") ?? {}) as Record<string, unknown>;
    // ApparelSize comes back as an element with an apparelSize child, but some
    // parts carry it as a bare string. Handle both rather than losing the size.
    const sizeNode = find(part, "ApparelSize");
    const sizeRecord = (typeof sizeNode === "object" && sizeNode !== null ? sizeNode : {}) as Record<
      string,
      unknown
    >;
    const size =
      sizeRecord.apparelSize ??
      sizeRecord.labelSize ??
      (typeof sizeNode === "string" || typeof sizeNode === "number" ? sizeNode : undefined) ??
      part.size ??
      part.labelSize ??
      "";
    return {
      partId: String(part.partId ?? ""),
      colourName: String(colour.colorName ?? part.colorName ?? ""),
      // SanMar send `hex` on the colour; colorCode is the standard's own name
      // for it and some suppliers use that instead.
      colourCode: String(colour.hex ?? colour.colorCode ?? part.colorCode ?? ""),
      size: String(size),
    };
  });

  return {
    styleCode,
    name: String(find(parsed, "productName") ?? ""),
    brand: String(
      find(parsed, "productBrand") ?? find(parsed, "primaryBrand") ?? find(parsed, "brandName") ?? "",
    ),
    description: asArray(find(parsed, "description") as string[])
      .map(String)
      .join(" ")
      .slice(0, 500),
    parts,
  };
}

/**
 * Cost per part id, in cents.
 *
 * The response nests one Part per colour/size, each carrying its own array of
 * quantity breaks — the partId is on the Part, not on the price row, which is
 * the detail that makes a naive read of this document come back empty.
 *
 * The lowest break is what we keep. These are quantity breaks on a net cost and
 * a campaign order of any size reaches the bottom of a garment table; taking
 * the top one would price every shirt as if one were being bought.
 */
export function parsePricing(xml: string): Map<string, number> {
  const parsed = parser.parse(xml);
  const costs = new Map<string, number>();

  function record(partId: string, price: unknown): void {
    const value = Number(price);
    if (!partId || !Number.isFinite(value) || value <= 0) return;
    const cents = Math.round(value * 100);
    const existing = costs.get(partId);
    if (existing === undefined || cents < existing) costs.set(partId, cents);
  }

  for (const part of asArray(find(parsed, "Part") as Record<string, unknown>[])) {
    const partId = String(part.partId ?? "");
    const rows = asArray(find(part, "PartPrice") as Record<string, unknown>[]);
    if (rows.length > 0) {
      for (const row of rows) record(partId, row.price ?? row.salePrice);
    } else {
      // Some implementations put a single price on the part itself.
      record(partId, find(part, "price"));
    }
  }

  // Last resort: price rows that carry their own partId, which is how the
  // standard allows it and how a different supplier might answer.
  if (costs.size === 0) {
    for (const row of asArray(find(parsed, "PartPrice") as Record<string, unknown>[])) {
      record(String(row.partId ?? ""), row.price ?? row.salePrice);
    }
  }

  return costs;
}

/**
 * One style, ready for the importer.
 *
 * Product data gives the colours, sizes and part ids; pricing gives what each
 * part costs; the part id is what joins them. A part with no price is dropped
 * rather than imported at zero — a shirt priced at nothing would sell at the
 * $12 floor and look deliberate.
 */
export async function fetchStyle(
  styleCode: string,
): Promise<{ rows: GarmentRow[]; problems: string[] }> {
  const config = sanmarConfig();
  const problems: string[] = [];
  if (!config.configured) return { rows: [], problems: ["SanMar credentials are not set."] };

  const productResults = await callFirstWorking(
    config.productUrls,
    "",
    productEnvelope(styleCode),
  );
  const productResult = productResults.find((r) => r.ok);
  if (!productResult) {
    problems.push(
      `No product-data endpoint answered. Tried: ${productResults.map((r) => `${r.url} (${r.error ?? r.status})`).join("; ")}`,
    );
    return { rows: [], problems };
  }

  const productFault = soapFault(productResult.body);
  if (productFault) problems.push(`Product data: ${productFault}`);

  const product = parseProduct(productResult.body, styleCode);
  if (product.parts.length === 0) {
    problems.push(`No parts came back for ${styleCode}. Run the probe and check the shape.`);
    return { rows: [], problems };
  }

  const pricingResults = await callFirstWorking(
    config.pricingUrls,
    "",
    pricingEnvelope(styleCode),
  );
  const pricingResult = pricingResults.find((r) => r.ok);
  const costs = pricingResult ? parsePricing(pricingResult.body) : new Map<string, number>();
  if (!pricingResult) problems.push("No pricing endpoint answered — colours and sizes only.");

  const rows: GarmentRow[] = [];
  let unpriced = 0;

  for (const part of product.parts) {
    const costCents = costs.get(part.partId);
    if (costCents === undefined || costCents <= 0) {
      unpriced++;
      continue;
    }
    rows.push({
      styleCode,
      brand: product.brand,
      name: product.name,
      description: product.description,
      colourName: part.colourName,
      colourCode: part.colourCode,
      size: part.size,
      costCents,
    });
  }

  if (unpriced > 0) problems.push(`${unpriced} of ${product.parts.length} parts had no price.`);
  return { rows, problems };
}
