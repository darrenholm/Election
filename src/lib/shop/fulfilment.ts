import { db } from "@/lib/db";
import { productBySlug, variantByKey } from "./catalog";
import {
  estimateShipping,
  placeOrder,
  quoteByKey,
  sinaliteConfig,
  type ShipTo,
  type ShippingOption,
  type VendorLine,
} from "./sinalite";
import {
  candidateShipTo,
  isVendorProduct,
  resolveVendorLine,
  shopBillTo,
  shopShipTo,
} from "./vendor-map";
import { signedArtworkUrl } from "./artwork-links";

/**
 * Getting a trade-printed job costed, and then printed.
 *
 * Sits between the order and the vendor adapter: it decides which lines are
 * bought in, asks what they cost, works out what they have to sell for, and
 * sends the job once it is paid. Nothing here knows SinaLite's wire format —
 * that is src/lib/shop/sinalite.ts — and nothing above here knows there is a
 * vendor at all.
 */

/**
 * The least a bought-in line can sell for.
 *
 * Trade cost doubled, plus our own file-prep charge. The markup is a business
 * decision and lives in the environment; the prep charge is the variant's setup
 * fee from the catalogue, and it is ours whoever runs the job — nearly every
 * candidate needs help getting a file to press, and that time is not in the
 * trade price.
 */
export function floorPriceCents(costCents: number, setupFeeCents: number): number {
  const { markupPercent } = sinaliteConfig();
  return Math.round(costCents * (1 + markupPercent / 100)) + setupFeeCents;
}

export type VendorQuoteResult = {
  lines: {
    itemId: string;
    description: string;
    costCents: number;
    chargedCents: number;
    floorCents: number;
  }[];
  goodsCents: number;
  shippingCents: number;
  /** Every carrier and service they offered for the whole job. */
  shippingOptions: ShippingOption[];
  /** What stopped a line being quoted — an unmapped id, a run they do not do. */
  problems: string[];
  dryRun: boolean;
};

type OrderAddress = {
  fulfilment: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
};

export type Destination = { shipTo: ShipTo; problem?: undefined } | { problem: string; shipTo?: undefined };

/** Where a job has to go: the candidate, or the shop for collection. */
export function shipToFor(order: OrderAddress): Destination {
  if (order.fulfilment === "DELIVERY") {
    if (!order.addressLine || !order.city || !order.postalCode) {
      return { problem: "This order is for delivery but has no full address on it." };
    }
    return { shipTo: candidateShipTo(order) };
  }

  const shop = shopShipTo();
  if (!shop) {
    return {
      problem:
        "This order is for pickup, so it ships to the shop — set SHOP_SHIP_ADDRESS, SHOP_SHIP_CITY and SHOP_SHIP_POSTAL_CODE.",
    };
  }
  return { shipTo: shop };
}

/**
 * Ask the trade printer what the bought-in lines on an order cost.
 *
 * Prices each line by its combination key and gets one freight quote for the
 * whole job, then stores the cost and the resolved ids on each line — so
 * sending it later uses exactly what was quoted rather than resolving it a
 * second time and possibly differently.
 */
export async function quoteOrderWithVendor(orderId: string): Promise<VendorQuoteResult> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  const empty = (problems: string[]): VendorQuoteResult => ({
    lines: [],
    goodsCents: 0,
    shippingCents: 0,
    shippingOptions: [],
    problems,
    dryRun: !sinaliteConfig().configured,
  });
  if (!order) return empty(["No such order."]);

  const destination = shipToFor(order);
  const result = empty(destination.problem ? [destination.problem] : []);

  // Kept, because the freight estimate takes the whole job in one call.
  const resolvedLines: { productId: string; options: Record<string, string> }[] = [];

  for (const item of order.items) {
    if (!isVendorProduct(item.productSlug)) continue;

    const resolved = resolveVendorLine(
      item.productSlug,
      item.variantKey,
      item.quantity,
      (item.options ?? {}) as Record<string, string>,
    );
    if (!resolved.ok) {
      result.problems.push(resolved.problem);
      continue;
    }

    try {
      const quote = await quoteByKey({
        productId: resolved.productId,
        optionIds: resolved.optionIds,
      });

      const product = productBySlug(item.productSlug);
      const variant = product ? variantByKey(product, item.variantKey) : null;
      const setupFeeCents = variant?.setupFeeCents ?? item.setupFeeCents;

      await db.shopOrderItem.update({
        where: { id: item.id },
        data: {
          vendorProductId: resolved.productId,
          vendorOptions: resolved.options,
          vendorCostCents: quote.costCents,
        },
      });

      result.lines.push({
        itemId: item.id,
        description: `${item.quantity} × ${item.productName} · ${item.variantName}`,
        costCents: quote.costCents,
        chargedCents: item.lineTotalCents,
        floorCents: floorPriceCents(quote.costCents, setupFeeCents),
      });
      result.goodsCents += quote.costCents;
      resolvedLines.push({ productId: resolved.productId, options: resolved.options });
    } catch (error) {
      result.problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  // One freight quote for the job. The cheapest service is taken as the working
  // figure; the shop can pick another before sending, and what the candidate
  // pays for delivery is a separate figure they set by hand.
  let carrier = "";
  let method = "";
  const shipTo = destination.shipTo;
  if (resolvedLines.length > 0 && shipTo) {
    try {
      const estimate = await estimateShipping({
        lines: resolvedLines,
        province: shipTo.province,
        postalCode: shipTo.postalCode,
        country: shipTo.country,
      });
      result.shippingOptions = [...estimate.options].sort((a, b) => a.priceCents - b.priceCents);

      const cheapest = result.shippingOptions[0];
      if (cheapest) {
        result.shippingCents = cheapest.priceCents;
        carrier = cheapest.carrier;
        method = cheapest.method;
      }
    } catch (error) {
      result.problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  await db.shopOrder.update({
    where: { id: order.id },
    data: {
      vendor: result.lines.length > 0 ? "SINALITE" : order.vendor,
      vendorCostCents: result.goodsCents,
      vendorShippingCents: result.shippingCents,
      vendorShipCarrier: carrier || order.vendorShipCarrier,
      vendorShipMethod: method || order.vendorShipMethod,
      vendorShipOptions: result.shippingOptions.length > 0 ? result.shippingOptions : undefined,
      vendorQuotedAt: new Date(),
      vendorError: result.problems.join(" "),
    },
  });

  return result;
}

/**
 * Send the job to press.
 *
 * Deliberately not automatic on payment. A candidate's artwork is looked at by
 * eye before it goes over — that is most of what the file-prep charge pays for —
 * so this is a button somebody presses, and it refuses to fire twice on the
 * same order.
 */
export async function sendOrderToVendor(orderId: string): Promise<{ ok: boolean; message: string }> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      artwork: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!order) return { ok: false, message: "No such order." };
  if (order.vendorOrderId) {
    return { ok: false, message: `Already sent — their reference is ${order.vendorOrderId}.` };
  }

  const destination = shipToFor(order);
  if (!destination.shipTo) return { ok: false, message: destination.problem };

  const billTo = shopBillTo();
  if (!billTo) {
    return { ok: false, message: "The shop's own billing address is not set — see SHOP_SHIP_*." };
  }

  const lines: VendorLine[] = [];
  for (const item of order.items) {
    if (!isVendorProduct(item.productSlug)) continue;

    const resolved = resolveVendorLine(
      item.productSlug,
      item.variantKey,
      item.quantity,
      (item.options ?? {}) as Record<string, string>,
    );
    if (!resolved.ok) return { ok: false, message: resolved.problem };

    // Files attached to this line, or the order's files when nothing was
    // attached to the line itself — which is the common case, since most
    // candidates send one PDF for the whole job. The first is the front and
    // the second, if there is one, is the back.
    const forLine = order.artwork.filter((a) => a.orderItemId === item.id);
    const files = (forLine.length > 0 ? forLine : order.artwork).slice(0, 2);
    if (files.length === 0) {
      return { ok: false, message: `No artwork for ${item.productName} — nothing to send to press.` };
    }

    lines.push({
      productId: resolved.productId,
      options: resolved.options,
      files: files.map((file, index) => ({
        type: index === 0 ? ("front" as const) : ("back" as const),
        url: signedArtworkUrl(file.id),
      })),
      extra: `${order.number ?? order.id} — ${item.productName} for ${order.candidateName}`,
    });
  }

  if (lines.length === 0) return { ok: false, message: "Nothing on this order is trade printed." };
  if (!order.vendorShipMethod && sinaliteConfig().configured) {
    return { ok: false, message: "Price it with SinaLite first — the order needs a shipping service." };
  }

  try {
    const placed = await placeOrder({
      lines,
      shipTo: destination.shipTo,
      billTo,
      shippingMethod: order.vendorShipMethod || "UPS Standard",
      notes: `${order.number ?? ""} — ${order.candidateName}, ${order.municipality}`.trim(),
    });

    await db.shopOrder.update({
      where: { id: order.id },
      data: {
        vendor: "SINALITE",
        vendorOrderId: placed.vendorOrderId,
        vendorStatus: placed.status,
        vendorSentAt: new Date(),
        vendorError: "",
      },
    });

    return {
      ok: true,
      message: placed.dryRun
        ? "Dry run — no SinaLite credentials are set, so nothing was really sent."
        : `Sent. Their order id is ${placed.vendorOrderId}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.shopOrder.update({ where: { id: order.id }, data: { vendorError: message } });
    return { ok: false, message };
  }
}

/**
 * Record the tracking number.
 *
 * Typed in rather than fetched: SinaLite's API publishes no order-status
 * endpoint, so what the shop knows arrives in their dispatch email. Putting it
 * here rather than in a note is what lets the candidate's own order page show
 * it, which is the whole reason it is worth typing.
 */
export async function recordVendorTracking(
  orderId: string,
  tracking: string,
  status: string,
): Promise<void> {
  await db.shopOrder.update({
    where: { id: orderId },
    data: { vendorTracking: tracking, vendorStatus: status || undefined },
  });
}
