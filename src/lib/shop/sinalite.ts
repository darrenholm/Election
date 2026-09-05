/**
 * SinaLite — the trade printer behind the post cards and door hangers.
 *
 * Cards and hangers are short-run offset work a small shop buys rather than
 * runs, so those lines are costed against SinaLite's trade price and, once the
 * candidate has paid, sent to them to print and drop-ship. Signs never come
 * through here: they are cut from sheets in the shop.
 *
 * Written against their published documentation, examples and all. Four things
 * in it shape everything below:
 *
 *   1. EVERY CHOICE IS AN OPTION ID, INCLUDING THE QUANTITY. A product's
 *      options come back as { id, group, name } — group "qty" name "50",
 *      group "Stock" name "Brown Cardboard" — and an order carries
 *      { "qty": "105", "Stock": "30" }: their group names, their ids as
 *      strings. So we can only sell the quantities they sell, which is why the
 *      trade-printed products in our catalogue offer fixed quantities rather
 *      than a box to type in.
 *
 *   2. A PRICE IS LOOKED UP BY A COMBINATION KEY. /variants lists every
 *      combination as { price, key } where the key is the chosen option ids in
 *      ascending order, joined with hyphens — "5-140-447-448" — and
 *      /pricedbykey/{id}/{key} prices one of them. That is how this adapter
 *      prices a line: it is documented down to the example, where
 *      /price/{id}/{storeCode} is not.
 *
 *   3. SHIPPING RATES COME BACK AS TUPLES, not objects:
 *      [ "UPS", "UPS Standard", 9.1, 1 ] — carrier, method, price, days.
 *
 *   4. THERE IS NO ORDER-STATUS ENDPOINT. What we know about a job is what
 *      they said when they took it; tracking arrives by email and is typed in.
 *      Do not add polling that cannot work.
 *
 * Money arrives as dollars and is converted to integer cents here, so nothing
 * downstream ever sees a float.
 *
 * Nothing outside this file knows SinaLite exists except src/lib/shop/
 * vendor-map.ts, which says which of our products are theirs. WITHOUT
 * CREDENTIALS THE WHOLE THING RUNS AS A DRY RUN, like the Twilio and Facebook
 * pipelines next door.
 */

import { PRINT_MARKUP_PERCENT } from "./catalog";

const HOSTS = {
  sandbox: "https://api.sinaliteuppy.com",
  live: "https://liveapi.sinalite.com",
} as const;

/** Their store ids, from the documentation. */
export const STORE_CANADA = 6;
export const STORE_UNITED_STATES = 9;

export type SinaliteConfig = {
  configured: boolean;
  host: string;
  /** 6 for Canada, 9 for the US. Only appears in URLs, never in a body. */
  store: number;
  clientId: string;
  clientSecret: string;
  audience: string;
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
    // A fixed value in their documentation, and NOT the host — the sandbox and
    // the live API both authenticate against this audience.
    audience: process.env.SINALITE_AUDIENCE || "https://apiconnect.sinalite.com",
    // The same markup the catalogue prices with, so the margin check in the
    // queue measures against what the storefront actually charges rather than
    // against a second figure that can drift. The environment can override it
    // for a one-off without a deploy.
    markupPercent: Number.isFinite(markup) ? markup : PRINT_MARKUP_PERCENT,
  };
}

/* --------------------------------------------------------------- the token */

let cached: { token: string; expiresAt: number } | null = null;

/**
 * When the token runs out.
 *
 * Their token response carries no expires_in, only the JWT itself, so the
 * expiry is read out of the token's own `exp` claim. Nothing is verified here —
 * the signature is theirs to check, and this is only deciding when to ask for a
 * new one — and an unreadable token simply gets the conservative hour.
 */
function expiryOf(jwt: string): number {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return Date.now() + 55 * 60_000;

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    if (typeof claims.exp === "number") return claims.exp * 1000;
  } catch {
    // Not a readable JWT. Fall through.
  }
  return Date.now() + 55 * 60_000;
}

async function accessToken(config: SinaliteConfig): Promise<string> {
  // A minute of slack, so a token that expires mid-request is not used.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(`${config.host}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`SinaLite refused the credentials (${response.status}).`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("SinaLite returned no access token.");

  cached = { token: body.access_token, expiresAt: expiryOf(body.access_token) };
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

/** Dollars to integer cents, however the number arrives. */
function toCents(value: unknown): number | null {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

/* ------------------------------------------------------------- catalogue -- */

export type SinaliteProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  enabled: boolean;
};

export async function fetchProducts(): Promise<SinaliteProduct[]> {
  const rows = await call<unknown[]>("/product");

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      sku: String(r.sku ?? ""),
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      // Their examples show 0 on products that are still listed, so this is
      // reported rather than filtered on.
      enabled: Boolean(Number(r.enabled ?? 0)),
    };
  });
}

/** One choosable value: its id, the group it belongs to, and what it is called. */
export type SinaliteOption = { id: string; group: string; name: string };

/**
 * A product's options, its priced combinations, and its metadata.
 *
 * Documented to return exactly three arrays, so they are handed back in those
 * parts. The first is what fills in src/lib/shop/vendor-map.ts; see
 * scripts/sinalite-catalog.ts.
 */
export async function fetchProductOptions(productId: string): Promise<{
  options: SinaliteOption[];
  combinations: unknown;
  meta: unknown;
}> {
  const config = sinaliteConfig();
  const body = await call<unknown>(`/product/${productId}/${config.store}`);
  const parts = Array.isArray(body) ? body : [body, null, null];

  const options = Array.isArray(parts[0])
    ? parts[0].map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          group: String(r.group ?? ""),
          name: String(r.name ?? ""),
        };
      })
    : [];

  return { options, combinations: parts[1] ?? null, meta: parts[2] ?? null };
}

/** Every priced combination of a product, 1000 at a time. */
export async function fetchVariants(
  productId: string,
  offset = 0,
): Promise<{ key: string; priceCents: number }[]> {
  const rows = await call<unknown[]>(`/variants/${productId}/${offset}`);

  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const priceCents = toCents(r.price);
    const key = String(r.key ?? "");
    return key && priceCents !== null ? [{ key, priceCents }] : [];
  });
}

/* ----------------------------------------------------------------- price -- */

/**
 * The key that names one combination: the chosen option ids, ascending,
 * hyphen-joined. Their own keys are in that order — "5-140-447-448" — and a key
 * in any other order is a key that will not be found.
 */
export function combinationKey(optionIds: string[]): string {
  return [...optionIds]
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
    .join("-");
}

export type VendorQuote = { costCents: number; dryRun: boolean; key: string };

/** What one configured line costs us. */
export async function quoteByKey(input: {
  productId: string;
  optionIds: string[];
}): Promise<VendorQuote> {
  const key = combinationKey(input.optionIds);
  const config = sinaliteConfig();
  if (!config.configured) return { costCents: 0, dryRun: true, key };

  const rows = await call<unknown[]>(`/pricedbykey/${input.productId}/${key}`);
  const first = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
  const costCents = toCents(first?.price);

  if (costCents === null) {
    throw new Error(
      `SinaLite returned no price for combination ${key} on product ${input.productId}. ` +
        "Usually that means one of the option ids in src/lib/shop/vendor-map.ts is wrong, " +
        "or that combination is not sold.",
    );
  }

  return { costCents, dryRun: false, key };
}

/* -------------------------------------------------------------- shipping -- */

export type ShippingOption = {
  carrier: string;
  method: string;
  priceCents: number;
  days: number | null;
};

export type ShipTo = {
  firstName: string;
  lastName: string;
  email: string;
  addressLine: string;
  addressLine2: string;
  city: string;
  /** Two letters: ON, BC, NY. */
  province: string;
  postalCode: string;
  /** CA or US. */
  country: string;
  phone: string;
};

/**
 * What it costs to get the whole job to an address.
 *
 * Asked once for the order rather than once per line — the lines ship together,
 * and their estimate takes every item in one call. Only the province, postal
 * code and country are needed to get a rate.
 */
export async function estimateShipping(input: {
  lines: { productId: string; options: Record<string, string> }[];
  province: string;
  postalCode: string;
  country: string;
}): Promise<{ options: ShippingOption[]; dryRun: boolean }> {
  const config = sinaliteConfig();
  if (!config.configured) return { options: [], dryRun: true };

  const body = await call<unknown>("/order/shippingEstimate", {
    method: "POST",
    body: {
      items: input.lines.map((line) => ({
        productId: Number(line.productId),
        options: line.options,
      })),
      shippingInfo: {
        ShipState: input.province,
        ShipZip: input.postalCode,
        ShipCountry: input.country,
      },
    },
  });

  // [ "UPS", "UPS Standard", 9.1, 1 ] — carrier, method, price, days.
  const rows = ((body ?? {}) as { body?: unknown }).body;

  return {
    options: (Array.isArray(rows) ? rows : []).flatMap((row) => {
      if (!Array.isArray(row)) return [];
      const priceCents = toCents(row[2]);
      if (priceCents === null) return [];

      const days = Number(row[3]);
      return [
        {
          carrier: String(row[0] ?? ""),
          method: String(row[1] ?? ""),
          priceCents,
          days: Number.isFinite(days) ? days : null,
        },
      ];
    }),
    dryRun: false,
  };
}

/* ----------------------------------------------------------------- order -- */

export type VendorLine = {
  productId: string;
  options: Record<string, string>;
  /** Print files. The front is required; a back is sent when there is one. */
  files: { type: "front" | "back"; url: string }[];
  /** Our own reference for the line, so their job ticket names it. */
  extra: string;
};

export type BillTo = {
  firstName: string;
  lastName: string;
  email: string;
  addressLine: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
};

export type VendorOrderResult = {
  vendorOrderId: string;
  status: string;
  message: string;
  dryRun: boolean;
};

export async function placeOrder(input: {
  lines: VendorLine[];
  shipTo: ShipTo;
  billTo: BillTo;
  /** One of their named services, verbatim: "UPS Standard" and the like. */
  shippingMethod: string;
  notes: string;
}): Promise<VendorOrderResult> {
  const config = sinaliteConfig();
  if (!config.configured) {
    return {
      vendorOrderId: `DRYRUN-${Date.now().toString(36).toUpperCase()}`,
      status: "dry-run",
      message: "Nothing was sent — SinaLite has no credentials configured.",
      dryRun: true,
    };
  }

  const body = await call<unknown>("/order/new", {
    method: "POST",
    body: {
      items: input.lines.map((line) => ({
        productId: Number(line.productId),
        options: line.options,
        files: line.files,
        extra: line.extra,
      })),
      shippingInfo: {
        ShipFName: input.shipTo.firstName,
        ShipLName: input.shipTo.lastName,
        ShipEmail: input.shipTo.email,
        ShipAddr: input.shipTo.addressLine,
        ShipAddr2: input.shipTo.addressLine2,
        ShipCity: input.shipTo.city,
        ShipState: input.shipTo.province,
        ShipZip: input.shipTo.postalCode,
        ShipCountry: input.shipTo.country,
        ShipPhone: input.shipTo.phone,
        ShipMethod: input.shippingMethod,
      },
      billingInfo: {
        BillFName: input.billTo.firstName,
        BillLName: input.billTo.lastName,
        BillEmail: input.billTo.email,
        BillAddr: input.billTo.addressLine,
        BillAddr2: input.billTo.addressLine2,
        BillCity: input.billTo.city,
        BillState: input.billTo.province,
        BillZip: input.billTo.postalCode,
        BillCountry: input.billTo.country,
        BillPhone: input.billTo.phone,
      },
      notes: input.notes,
    },
  });

  const r = (body ?? {}) as Record<string, unknown>;
  const vendorOrderId = r.orderId === undefined || r.orderId === null ? "" : String(r.orderId);
  if (!vendorOrderId) {
    throw new Error(`SinaLite did not return an order id: ${JSON.stringify(r).slice(0, 300)}`);
  }

  return {
    vendorOrderId,
    status: String(r.status ?? ""),
    message: String(r.message ?? ""),
    dryRun: false,
  };
}
