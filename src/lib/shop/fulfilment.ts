import { db } from "@/lib/db";
import { productBySlug, variantByKey } from "./catalog";
import {
  estimateShipping,
  placeOrder,
  quoteLine,
  sinaliteConfig,
  type ShipTo,
  type ShippingOption,
  type VendorLine,
} from "./sinalite";
import { isVendorProduct, resolveVendorLine, shopShipTo } from "./vendor-map";
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
  /** Lines that were quoted, with what each costs us and what it was sold for. */
  lines: {
    itemId: string;
    description: string;
    quantity: number;
    costCents: number;
    chargedCents: number;
    floorCents: number;
  }[];
  goodsCents: number;
  shippingCents: number;
  /** Every carrier and service they offered for the whole job. */
  shippingOptions: ShippingOption[];
  /** Problems that stopped a line being quoted — unmapped ids, mostly. */
  problems: string[];
  dryRun: boolean;
};

/** Where a job has to be delivered: the candidate, or the shop for collection. */
export function shipToFor(order: {
  fulfilment: string;
  contactName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  phone: string;
}): { shipTo: ShipTo } | { problem: string } {
  if (order.fulfilment === "DELIVERY") {
    if (!order.addressLine || !order.city || !order.postalCode) {
      return { problem: "This order is for delivery but has no full address on it." };
    }
    return {
      shipTo: {
        name: order.contactName,
        addressLine: order.addressLine,
        city: order.city,
        // The portal does not ask for a province: every candidate on it is
        // running in an Ontario municipality. Revisit if that stops being true.
        province: "ON",
        postalCode: order.postalCode,
        country: "CA",
        phone: order.phone,
      },
    };
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
 * Stores the cost and the resolved vendor ids on each line, so sending the job
 * later uses exactly what was quoted rather than resolving it a second time and
 * possibly differently.
 */
export async function quoteOrderWithVendor(orderId: string): Promise<VendorQuoteResult> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) {
    return {
      lines: [],
      goodsCents: 0,
      shippingCents: 0,
      shippingOptions: [],
      problems: ["No such order."],
      dryRun: false,
    };
  }

  const destination = shipToFor(order);

  const result: VendorQuoteResult = {
    lines: [],
    goodsCents: 0,
    shippingCents: 0,
    shippingOptions: [],
    problems: "problem" in destination ? [destination.problem] : [],
    dryRun: !sinaliteConfig().configured,
  };

  // Resolved lines are kept, because the shipping estimate wants the whole job
  // in one call rather than a rate per line.
  const resolvedLines: { productId: string; options: Record<string, string>; quantity: number }[] = [];

  for (const item of order.items) {
    if (!isVendorProduct(item.productSlug)) continue;

    const resolved = resolveVendorLine(
      item.productSlug,
      item.variantKey,
      (item.options ?? {}) as Record<string, string>,
    );
    if (!resolved.ok) {
      result.problems.push(resolved.problem);
      continue;
    }

    try {
      const quote = await quoteLine({
        productId: resolved.productId,
        options: resolved.options,
        quantity: item.quantity,
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
        quantity: item.quantity,
        costCents: quote.costCents,
        chargedCents: item.lineTotalCents,
        floorCents: floorPriceCents(quote.costCents, setupFeeCents),
      });
      result.goodsCents += quote.costCents;

      resolvedLines.push({
        productId: resolved.productId,
        options: resolved.options,
        quantity: item.quantity,
      });
    } catch (error) {
      result.problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  // One freight quote for the job. The cheapest service is taken as the
  // working figure — the shop can pick another before sending, and what the
  // candidate is charged for delivery is a separate field they set by hand.
  let carrier = "";
  let method = "";
  if (resolvedLines.length > 0 && "shipTo" in destination) {
    try {
      const estimate = await estimateShipping({
        lines: resolvedLines,
        shipTo: destination.shipTo,
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
 * Send the job.
 *
 * Deliberately not automatic on payment. A candidate's artwork is checked by
 * eye before it goes to press — that is most of what the file-prep charge pays
 * for — so this is a button somebody presses, and it refuses to fire twice on
 * the same order.
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
  if ("problem" in destination) return { ok: false, message: destination.problem };

  const lines: VendorLine[] = [];
  for (const item of order.items) {
    if (!isVendorProduct(item.productSlug)) continue;

    const resolved = resolveVendorLine(
      item.productSlug,
      item.variantKey,
      (item.options ?? {}) as Record<string, string>,
    );
    if (!resolved.ok) return { ok: false, message: resolved.problem };

    // The file for this line, or the order's first file when nothing was
    // attached to the line itself — which is the common case, since most
    // candidates send one PDF for the whole job.
    const file =
      order.artwork.find((a) => a.orderItemId === item.id) ?? order.artwork[0] ?? null;

    lines.push({
      productId: resolved.productId,
      options: resolved.options,
      quantity: item.quantity,
      artworkUrl: file ? signedArtworkUrl(file.id) : undefined,
    });
  }

  if (lines.length === 0) return { ok: false, message: "Nothing on this order is trade printed." };
  if (lines.some((line) => !line.artworkUrl)) {
    return { ok: false, message: "No artwork on the order yet — nothing to send to press." };
  }
  if (!order.vendorShipMethod && sinaliteConfig().configured) {
    return { ok: false, message: "Price it with SinaLite first — the order needs a shipping service." };
  }

  try {
    const placed = await placeOrder({
      reference: order.number ?? order.id,
      lines,
      shipTo: destination.shipTo,
      shippingMethod: order.vendorShipMethod,
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
        : `Sent. Their reference is ${placed.vendorOrderId}.`,
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
    data: {
      vendorTracking: tracking,
      vendorStatus: status || undefined,
    },
  });
}
