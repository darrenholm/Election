import { XMLParser } from "fast-xml-parser";
import type { GarmentRow } from "./garment-import";

/**
 * SanMar Canada — where the garment data comes from.
 *
 * Their services are SOAP, and they implement the PromoStandards suite: an
 * industry standard rather than a house format, which is why this can be
 * written at all without having watched a call go over the wire. The envelopes
 * below are the standard's own shapes; what is genuinely uncertain is which
 * endpoint URLs this account uses, and SanMar Canada's differ from SanMar US.
 *
 * SO NOTHING HERE IS TRUSTED UNTIL IT HAS ANSWERED. `npm run sanmar:probe`
 * tries each candidate endpoint from wherever it is run — on Railway, where the
 * network reaches SanMar — and prints what came back, raw. That is how the
 * guesses below get replaced by facts, and why the endpoints are environment
 * variables rather than constants.
 *
 * Two services are used:
 *   Product data          colours, sizes, and the part ids that join the two
 *   Pricing and config    net cost per part
 *
 * Media content needs a separate password (SANMAR_MEDIA_PASSWORD) and is not
 * used yet — it is where product photography would come from.
 */

/* -------------------------------------------------------------------------
 * ENDPOINTS — the uncertain part. An environment variable always wins; the
 * candidates are tried by the probe, in order, and the first that answers is
 * the one to put in the environment.
 * ---------------------------------------------------------------------- */
const CANDIDATE_PRODUCT_URLS = [
  "https://ws.sanmarcanada.com/promostandards/ProductDataServiceBinding",
  "https://ws.sanmar.com:8080/promostandards/ProductDataServiceBinding",
];

const CANDIDATE_PRICING_URLS = [
  "https://ws.sanmarcanada.com/promostandards/PricingAndConfigurationServiceBinding",
  "https://ws.sanmar.com:8080/promostandards/PricingAndConfigurationServiceBinding",
];

export type SanmarConfig = {
  configured: boolean;
  username: string;
  password: string;
  mediaPassword: string;
  customerNumber: string;
  environment: "sandbox" | "live";
  productUrls: string[];
  pricingUrls: string[];
  /** ISO code the prices come back in. */
  currency: string;
};

export function sanmarConfig(): SanmarConfig {
  const username = process.env.SANMAR_USERNAME || "";
  const password = process.env.SANMAR_PASSWORD || "";

  const productUrl = process.env.SANMAR_PRODUCT_URL || "";
  const pricingUrl = process.env.SANMAR_PRICING_URL || "";

  return {
    configured: Boolean(username && password),
    username,
    password,
    mediaPassword: process.env.SANMAR_MEDIA_PASSWORD || "",
    customerNumber: process.env.SANMAR_CUSTOMER_NUMBER || "",
    environment: process.env.SANMAR_ENV === "live" ? "live" : "sandbox",
    productUrls: productUrl ? [productUrl] : CANDIDATE_PRODUCT_URLS,
    pricingUrls: pricingUrl ? [pricingUrl] : CANDIDATE_PRICING_URLS,
    currency: process.env.SANMAR_CURRENCY || "CAD",
  };
}

/* ------------------------------------------------------------- envelopes -- */

const PRODUCT_NS = "http://www.promostandards.org/WSDL/ProductDataService/2.0.0/";
const PRODUCT_SHARED_NS =
  "http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/";
const PRICING_NS =
  "http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/";
const PRICING_SHARED_NS =
  "http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export function productEnvelope(styleCode: string): string {
  const { username, password } = sanmarConfig();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${PRODUCT_NS}" xmlns:shar="${PRODUCT_SHARED_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:GetProductRequest>
      <shar:wsVersion>2.0.0</shar:wsVersion>
      <shar:id>${escapeXml(username)}</shar:id>
      <shar:password>${escapeXml(password)}</shar:password>
      <shar:localizationCountry>CA</shar:localizationCountry>
      <shar:localizationLanguage>EN</shar:localizationLanguage>
      <shar:productId>${escapeXml(styleCode)}</shar:productId>
    </ns:GetProductRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function pricingEnvelope(styleCode: string): string {
  const { username, password, currency } = sanmarConfig();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${PRICING_NS}" xmlns:shar="${PRICING_SHARED_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:GetConfigurationAndPricingRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${escapeXml(username)}</shar:id>
      <shar:password>${escapeXml(password)}</shar:password>
      <shar:productId>${escapeXml(styleCode)}</shar:productId>
      <shar:currency>${escapeXml(currency)}</shar:currency>
      <shar:fobId>1</shar:fobId>
      <shar:priceType>Net</shar:priceType>
      <shar:localizationCountry>CA</shar:localizationCountry>
      <shar:localizationLanguage>EN</shar:localizationLanguage>
      <shar:configurationType>Blank</shar:configurationType>
    </ns:GetConfigurationAndPricingRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
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
        SOAPAction: soapAction,
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
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: true });

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
    const size = (find(part, "ApparelSize") ?? {}) as Record<string, unknown>;
    return {
      partId: String(part.partId ?? ""),
      colourName: String(colour.colorName ?? part.colorName ?? ""),
      colourCode: String(colour.colorCode ?? part.colorCode ?? ""),
      size: String(size.labelSize ?? size.apparelStyle ?? part.labelSize ?? ""),
    };
  });

  return {
    styleCode,
    name: String(find(parsed, "productName") ?? ""),
    brand: String(find(parsed, "primaryBrand") ?? find(parsed, "brandName") ?? ""),
    description: asArray(find(parsed, "description") as string[])
      .map(String)
      .join(" ")
      .slice(0, 500),
    parts,
  };
}

/** Net cost per part id, in cents. */
export function parsePricing(xml: string): Map<string, number> {
  const parsed = parser.parse(xml);
  const costs = new Map<string, number>();

  for (const part of asArray(find(parsed, "PartPrice") as Record<string, unknown>[])) {
    const partId = String(part.partId ?? "");
    const price = Number(part.price ?? part.salePrice);
    if (partId && Number.isFinite(price)) {
      // The lowest break wins: these are net costs at a quantity, and the
      // cheapest is the one a real order of any size reaches.
      const cents = Math.round(price * 100);
      const existing = costs.get(partId);
      if (existing === undefined || cents < existing) costs.set(partId, cents);
    }
  }

  // Some implementations nest the price inside the part rather than in a
  // PartPrice array, so fall back to that shape before giving up.
  if (costs.size === 0) {
    for (const part of asArray(find(parsed, "Part") as Record<string, unknown>[])) {
      const partId = String(part.partId ?? "");
      const price = Number(find(part, "price"));
      if (partId && Number.isFinite(price)) costs.set(partId, Math.round(price * 100));
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
    "getProduct",
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
    "getConfigurationAndPricing",
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
