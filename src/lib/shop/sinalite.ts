/**
 * SinaLite — the trade printer behind the post cards and door hangers.
 *
 * Cards and hangers are short-run offset work a small shop buys rather than
 * runs, so those lines are costed against SinaLite's trade price and, once the
 * candidate has paid, sent to them to print and drop-ship. Signs never come
 * through here: they are cut from sheets in the shop.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT
 * --------------------------------
 * From SinaLite's published API index (liveapi.sinalite.com), and taken as
 * fact by the code below:
 *
 *   POST /auth/token                     client-credentials exchange
 *   GET  /product                        every product
 *   GET  /product/{id}                   one product's general data
 *   GET  /product/{id}/{storeCode}       three arrays: options, pricing
 *                                        combinations, meta
 *   POST /price/{id}/{storeCode}         price and shipping for a combination
 *   GET  /variants/{id}/{offset}         variants, 1000 at a time
 *   GET  /pricedbykey/{id}/{key}         one variant's price
 *   POST /order/new                      place an order
 *   POST /order/shippingEstimate         carrier, method, price, shipping days
 *
 *   storeCode is a NUMBER: 6 is Canada, 9 is the United States.
 *   Provinces and states are two-letter codes; country is CA or US.
 *   Shipping methods are named strings — "UPS Standard", "FedEx Economy" …
 *
 * NOT verified: the field names inside the request and response bodies. The
 * documentation's examples are collapsed, so every body this file builds or
 * reads is a best reading, collected in the BODY block below and nowhere else.
 * Correct them there and nothing outside this file changes.
 *
 * There is NO order-status endpoint in their API. Once a job is accepted, what
 * we know is what they said at the time; tracking arrives by email and is typed
 * into the queue by hand. Do not add polling that cannot work.
 *
 * WITHOUT CREDENTIALS THE WHOLE THING RUNS AS A DRY RUN, like the Twilio and
 * Facebook pipelines next door: quotes come back marked, orders record what
 * would have gone, and the queue says so on the page.
 */

const HOSTS = {
  sandbox: "https://api.sinaliteuppy.com",
  live: "https://liveapi.sinalite.com",
} as const;

/** Their store ids, from the documentation. */
export const STORE_CANADA = 6;
export const STORE_UNITED_STATES = 9;

/* -------------------------------------------------------------------------
 * BODY — the unverified half: what goes inside the requests, and what is
 * read back out. Correct against SinaLite's examples.
 * ---------------------------------------------------------------------- */
const BODY = {
  /** Keys a price response might carry the goods total under. */
  priceKeys: ["price", "subtotal", "total", "amount"],
  /** …and the shipping figure, when the price call returns one. */
  shippingKeys: ["shipping", "shippingCost", "freight"],
  /** Keys an order response might carry their order id under. */
  orderIdKeys: ["id", "orderId", "order_id", "orderNumber"],
} as const;

export type SinaliteConfig = {
  configured: boolean;
  host: string;
  /** 6 for Canada, 9 for the US. */
  store: number;
  clientId: string;
  clientSecret: string;
  /** Percent added to trade cost to reach retail. 100 means cost doubled. */
  markupPercent: number;
};

export function sinaliteConfig(): SinaliteConfig {
  const clientId = process.env.SINALITE_CLIENT_ID || "";
  const clientSecret = process.env.SINALITE_CLIENT_SECRET || "";
  const environment = process.env.SINALITE_ENV === "live" ? "live" : "sandbox";

  const store = Number(process.env.SINALITE_STORE_CODE);
  const markup = Number(process.env.SINALITE_MARKUP_PERCENT);

  return {
    configured: Boolean(clientId && clientSecret),
    host: HOSTS[environment],
    store: Number.isFinite(store) && store > 0 ? store : STORE_CANADA,
    clientId,
    clientSecret,
    // Doubling trade cost is the shop's rule; the file-prep charge is added on
    // top of it, in src/lib/shop/fulfilment.ts.
    markupPercent: Number.isFinite(markup) ? markup : 100,
  };
}

/* --------------------------------------------------------------- the token */

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(config: SinaliteConfig): Promise<string> {
  // A minute of slack, so a token that expires mid-request is not used.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(`${config.host}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.host,
    }),
  });

  if (!response.ok) {
    throw new Error(`SinaLite refused the credentials (${response.status}).`);
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("SinaLite returned no access token.");

  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Drops the cached token, so a rotated secret does not keep failing for an hour. */
export function forgetSinaliteToken(): void {
  cached = null;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const config = sinaliteConfig();
  if (!config.configured) throw new Error("SinaLite is not configured.");

  const token = await accessToken(config);
  const response = await fetch(`${config.host}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  if (!response.ok) {
    // Their message, trimmed, is far more use in the queue than a status code.
    throw new Error(`SinaLite ${response.status}: ${text.slice(0, 300)}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Read a money value that may arrive as a number or a string, under any of
 * several names. Defensive on purpose: this is the field most likely to be
 * called something other than what is guessed above, and a silent zero here
 * would quote a job at cost.
 */
function readCents(source: unknown, keys: readonly string[]): number | null {
  if (typeof source !== "object" || source === null) return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    const amount = typeof value === "string" ? Number(value) : value;
    if (typeof amount === "number" && Number.isFinite(amount)) return Math.round(amount * 100);
  }
  return null;
}

/* ------------------------------------------------------------- catalogue -- */

export type SinaliteProduct = { id: string; name: string; category?: string };

export async function fetchProducts(): Promise<SinaliteProduct[]> {
  const body = await call<unknown>("/product");
  const rows = Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? []);

  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? r.product_id ?? ""),
      name: String(r.name ?? r.title ?? ""),
      category: r.category ? String(r.category) : undefined,
    };
  });
}

/**
 * One product's option set.
 *
 * Documented to return three arrays — the options, the pricing combinations,
 * and the product's metadata — so it is handed back in those parts rather than
 * flattened. This is what fills in src/lib/shop/vendor-map.ts; see
 * scripts/sinalite-catalog.ts.
 */
export async function fetchProductOptions(
  productId: string,
): Promise<{ options: unknown; combinations: unknown; meta: unknown }> {
  const config = sinaliteConfig();
  const body = await call<unknown>(`/product/${productId}/${config.store}`);

  if (Array.isArray(body)) {
    return { options: body[0] ?? null, combinations: body[1] ?? null, meta: body[2] ?? null };
  }
  return { options: body, combinations: null, meta: null };
}

/* ----------------------------------------------------------------- price -- */

export type VendorQuote = {
  /** Trade cost of the goods, in cents. */
  costCents: number;
  /** Shipping, when the price call returned one. Zero otherwise — ask
   *  estimateShipping() for a real figure. */
  shippingCents: number;
  dryRun: boolean;
  /** Kept so a surprising figure can be argued with. */
  raw?: unknown;
};

export type ShipTo = {
  name: string;
  addressLine: string;
  city: string;
  /** Two letters: ON, BC, NY. */
  province: string;
  postalCode: string;
  /** CA or US. */
  country: string;
  phone: string;
};

/** What one configured line costs us. */
export async function quoteLine(input: {
  productId: string;
  options: Record<string, string>;
  quantity: number;
}): Promise<VendorQuote> {
  const config = sinaliteConfig();
  if (!config.configured) return { costCents: 0, shippingCents: 0, dryRun: true };

  const body = await call<unknown>(`/price/${input.productId}/${config.store}`, {
    method: "POST",
    body: { productOptions: input.options, quantity: input.quantity },
  });

  const costCents = readCents(body, BODY.priceKeys);
  if (costCents === null) {
    throw new Error(
      "SinaLite priced the job but this adapter could not find the amount — check BODY.priceKeys in src/lib/shop/sinalite.ts against their example response.",
    );
  }

  return {
    costCents,
    shippingCents: readCents(body, BODY.shippingKeys) ?? 0,
    dryRun: false,
    raw: body,
  };
}

/* -------------------------------------------------------------- shipping -- */

export type ShippingOption = {
  carrier: string;
  method: string;
  priceCents: number;
  days: number | null;
};

/**
 * What it costs to get the whole job to an address.
 *
 * Asked once for the order rather than once per line: the lines ship together,
 * and summing per-line freight would quote a candidate for three parcels that
 * arrive as one box.
 */
export async function estimateShipping(input: {
  lines: { productId: string; options: Record<string, string>; quantity: number }[];
  shipTo: ShipTo;
}): Promise<{ options: ShippingOption[]; dryRun: boolean }> {
  const config = sinaliteConfig();
  if (!config.configured) return { options: [], dryRun: true };

  const body = await call<unknown>("/order/shippingEstimate", {
    method: "POST",
    body: {
      storeCode: config.store,
      items: input.lines.map((line) => ({
        productId: line.productId,
        productOptions: line.options,
        quantity: line.quantity,
      })),
      shippingAddress: addressBody(input.shipTo),
    },
  });

  const rows = Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? []);

  return {
    options: rows
      .map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        const priceCents = readCents(r, ["price", "cost", "rate", "amount"]);
        const days = Number(r.shippingDays ?? r.days ?? r.transitDays);
        return {
          carrier: String(r.carrierName ?? r.carrier ?? ""),
          method: String(r.carrierMethod ?? r.method ?? r.service ?? ""),
          priceCents: priceCents ?? 0,
          days: Number.isFinite(days) ? days : null,
        };
      })
      // A rate with no price is not a rate.
      .filter((option) => option.priceCents > 0),
    dryRun: false,
  };
}

/* ----------------------------------------------------------------- order -- */

function addressBody(shipTo: ShipTo) {
  return {
    name: shipTo.name,
    address: shipTo.addressLine,
    city: shipTo.city,
    province: shipTo.province,
    postalCode: shipTo.postalCode,
    country: shipTo.country,
    phone: shipTo.phone,
  };
}

export type VendorLine = {
  productId: string;
  options: Record<string, string>;
  quantity: number;
  /** A URL SinaLite can fetch the print file from, unauthenticated and expiring. */
  artworkUrl?: string;
};

export type VendorOrderResult = {
  vendorOrderId: string;
  status: string;
  dryRun: boolean;
  raw?: unknown;
};

export async function placeOrder(input: {
  reference: string;
  lines: VendorLine[];
  shipTo: ShipTo;
  /** One of the methods estimateShipping() returned, verbatim. */
  shippingMethod: string;
}): Promise<VendorOrderResult> {
  const config = sinaliteConfig();
  if (!config.configured) {
    return { vendorOrderId: `DRYRUN-${input.reference}`, status: "DRY_RUN", dryRun: true };
  }

  const body = await call<unknown>("/order/new", {
    method: "POST",
    body: {
      storeCode: config.store,
      // Our own order number, so a job can be found from either end.
      externalId: input.reference,
      shippingMethod: input.shippingMethod,
      items: input.lines.map((line) => ({
        productId: line.productId,
        productOptions: line.options,
        quantity: line.quantity,
        artworkUrl: line.artworkUrl,
      })),
      shippingAddress: addressBody(input.shipTo),
    },
  });

  const r = (body ?? {}) as Record<string, unknown>;
  let vendorOrderId = "";
  for (const key of BODY.orderIdKeys) {
    if (r[key] !== undefined && r[key] !== null && String(r[key]) !== "") {
      vendorOrderId = String(r[key]);
      break;
    }
  }
  if (!vendorOrderId) {
    throw new Error(
      "SinaLite accepted the order but this adapter could not find their order id — check BODY.orderIdKeys in src/lib/shop/sinalite.ts.",
    );
  }

  return { vendorOrderId, status: String(r.status ?? "RECEIVED"), dryRun: false, raw: body };
}
