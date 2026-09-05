/**
 * The shop's own API, for apparel.
 *
 * WHY THIS EXISTS. The election portal used to price garments itself: SanMar's
 * cost doubled, floored at $12, plus a flat setup. That was wrong. Holm
 * Graphics already prices apparel — in holmgraphics-shop-api, whose
 * lib/dtf-pricing.js is the shop's real engine: per print location, in quantity
 * tiers, aggregated per design across an order rather than per line. A second
 * pricing model in this app would quote figures the shop does not charge, and
 * would drift further every time somebody edited one and not the other.
 *
 * So apparel is not priced here. It is asked for.
 *
 * Three endpoints, all public on that service — no key, no customer account:
 *
 *   GET  /api/catalog/{supplier}/{style}    colours, sizes, variant ids, cost
 *   GET  /api/dtf/print-locations           where a design can go, and the tiers
 *   POST /api/orders/quote                  what a cart actually costs
 *
 * The quote is authoritative. This app does not add a markup to what comes
 * back, does not round it, and does not cache it: the shop's engine has already
 * done that arithmetic, and second-guessing it is how the two drift apart.
 *
 * MONEY. That API talks in dollars as JavaScript numbers; this app is integer
 * cents everywhere. The conversion happens here, at the boundary, and nowhere
 * else.
 *
 * DRY RUN. Unconfigured, every call reports that it is not configured rather
 * than throwing — the same rule the Twilio, Meta, SinaLite and SanMar adapters
 * follow, so the portal works end to end before this is pointed anywhere.
 */

/** Where the shop's API lives. api.holmgraphics.ca in production. */
export function holmgraphicsBase(): string {
  return (process.env.HOLMGRAPHICS_API_URL || "").replace(/\/+$/, "");
}

export function holmgraphicsConfigured(): boolean {
  return holmgraphicsBase().length > 0;
}

/**
 * SanMar Canada's code in the shop's supplier table.
 *
 * From suppliers/sanmar/config.js in that repository. The catalogue path is
 * /api/catalog/{supplier}/{style}, and the supplier is in the path precisely so
 * that a style number can exist in more than one supplier's catalogue.
 */
export const SUPPLIER_CODE = "sanmar_ca";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; problem: string; configured: boolean };

/** One GET or POST, translated into a result rather than an exception. */
async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const base = holmgraphicsBase();
  if (!base) {
    return {
      ok: false,
      configured: false,
      problem:
        "HOLMGRAPHICS_API_URL is not set, so apparel cannot be priced. Point it at " +
        "the shop's API (https://api.holmgraphics.ca) on this service in Railway.",
    };
  }

  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
      // Prices change when the shop changes them, so nothing here is cached by
      // the framework. The pages that use it are already dynamic.
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      // The API answers errors as JSON with a message; fall back to the status
      // when it has answered with something else entirely (a proxy, an HTML
      // error page) so the report says what actually happened.
      let detail = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        detail = parsed.error || parsed.message || detail;
      } catch {
        detail = `${detail} ${text.slice(0, 200)}`.trim();
      }
      return { ok: false, configured: true, problem: detail };
    }

    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

/* ---------------------------------------------------------------- catalogue */

/** One size in one colour, as the shop's catalogue holds it. */
export type ApiVariant = {
  id: number;
  supplier_variant_id: string | null;
  size: string;
  size_order: number | null;
  color_name: string;
  color_hex: string | null;
  image_url: string | null;
  quantity: number | null;
  price: string | number | null;
  sale_price: string | number | null;
};

export type ApiProduct = {
  id: number;
  style: string;
  product_name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  is_sellable: boolean;
  is_discontinued: boolean;
  last_synced_at: string | null;
};

export type ApiStyle = { product: ApiProduct; variants: ApiVariant[] };

/** A style's colours, sizes and variant ids. */
export function fetchStyle(style: string): Promise<ApiResult<ApiStyle>> {
  return call<ApiStyle>(`/api/catalog/${SUPPLIER_CODE}/${encodeURIComponent(style)}`);
}

/* ----------------------------------------------------------- print locations */

export type ApiTier = {
  min_quantity: number;
  max_quantity: number | null;
  price_per_piece: number;
};

export type ApiPrintLocation = {
  id: number;
  name?: string;
  garment_category?: string;
  tiers: ApiTier[];
};

/** Where a design can be printed, and what each costs by quantity. */
export function fetchPrintLocations(): Promise<
  ApiResult<{ print_locations: ApiPrintLocation[] }>
> {
  return call<{ print_locations: ApiPrintLocation[] }>(
    "/api/dtf/print-locations?category=apparel",
  );
}

/* ------------------------------------------------------------------- quoting */

/**
 * One line of a cart, in the shape that API validates.
 *
 * `design_id` drives the quantity tier and it is a grouping key, not a foreign
 * key — the pricing engine only ever adds up quantities under it and decides
 * whether setup has already been billed for it. So a campaign can pass its own
 * id and get the tiering it should have: one design across shirts and hoodies
 * tiers on the total, which is exactly how the shop quotes it at the counter.
 */
export type QuoteItem = {
  supplier: string;
  style: string;
  variant_id: number;
  size: string;
  quantity: number;
  unit_price: number;
  decorations: { design_id: string; print_location_id: number }[];
};

export type QuoteBreakdown = {
  subtotal?: number;
  setup_total?: number;
  decoration_total?: number;
  tax_total?: number;
  shipping_total?: number;
  grand_total?: number;
  [key: string]: unknown;
};

/**
 * What a run of garments actually costs.
 *
 * Pickup, always: everything on this portal is collected from the shop, and
 * pickup is also what tells that API to tax at the seller's province rather
 * than asking for a shipping address the portal does not collect.
 */
export function quoteApparel(items: QuoteItem[]): Promise<
  ApiResult<{ ok: boolean; breakdown: QuoteBreakdown }>
> {
  return call<{ ok: boolean; breakdown: QuoteBreakdown }>("/api/orders/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cart: { items },
      fulfillment_method: "pickup",
      shipping_total: 0,
    }),
  });
}

/** Dollars from that API into this app's integer cents. */
export function toCents(amount: string | number | null | undefined): number {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
