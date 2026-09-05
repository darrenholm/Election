import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { TRADE_SHIPPING_FLAT_CENTS, productBySlug, variantByKey } from "./catalog";
import { isVendorProduct } from "./vendor-map";
import { orderTotals, priceLine, snapQuantity, type ChosenOptions } from "./pricing";

/**
 * The cart, the totals and the order number.
 *
 * A cart here is an order with status DRAFT rather than a table of its own, so
 * there is one thing to price, show and total instead of two that could
 * disagree. It also means a half-built order survives a change of device: a
 * candidate who starts on a phone finishes on a laptop.
 */

/** One draft per customer. Created on first use rather than at registration. */
export async function draftOrderId(customerId: string): Promise<string> {
  const existing = await db.shopOrder.findFirst({
    where: { customerId, status: "DRAFT" },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.id;

  const created = await db.shopOrder.create({
    data: { customerId, status: "DRAFT" },
    select: { id: true },
  });
  return created.id;
}

export async function cartItemCount(customerId: string): Promise<number> {
  const draft = await db.shopOrder.findFirst({
    where: { customerId, status: "DRAFT" },
    select: { _count: { select: { items: true } } },
  });
  return draft?._count.items ?? 0;
}

/**
 * Re-add up an order and store what it comes to.
 *
 * Called after anything that could move a figure — a line added or removed, the
 * design service ticked, the shop setting a delivery charge or a discount. The
 * totals are stored rather than computed on read because an order is a record
 * of a price that was agreed, and re-deriving it later from a catalogue that
 * has since changed would quietly rewrite history.
 */
export async function recalcOrder(orderId: string): Promise<void> {
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      needsDesign: true,
      deliveryCents: true,
      adjustmentCents: true,
      items: { select: { lineTotalCents: true, productSlug: true } },
    },
  });
  if (!order) return;

  // Anything bought in has to be got here, and until SinaLite's own freight
  // quote is wired that is a flat figure. Only while the order is a cart: once
  // it is submitted the shop owns the delivery line and may have replaced this
  // with what the courier actually charged.
  const boughtIn = order.items.some((item) => isVendorProduct(item.productSlug));
  const deliveryCents =
    order.status === "DRAFT" && boughtIn ? TRADE_SHIPPING_FLAT_CENTS : order.deliveryCents;

  const totals = orderTotals({
    lineTotals: order.items.map((i) => i.lineTotalCents),
    needsDesign: order.needsDesign,
    deliveryCents,
    adjustmentCents: order.adjustmentCents,
  });

  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      subtotalCents: totals.subtotalCents,
      designFeeCents: totals.designFeeCents,
      deliveryCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
  });
}

/**
 * Re-price one stored line against the catalogue.
 *
 * Used when a quantity is edited in the cart. A line whose product has since
 * been retired from the catalogue is left exactly as it was rather than being
 * silently zeroed — the shop can still make it, and the price it was quoted at
 * still stands.
 */
export async function repriceItem(itemId: string, quantity: number): Promise<void> {
  const item = await db.shopOrderItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const product = productBySlug(item.productSlug);
  const variant = product ? variantByKey(product, item.variantKey) : null;
  if (!product || !variant) {
    await db.shopOrderItem.update({
      where: { id: itemId },
      data: { quantity, lineTotalCents: item.unitPriceCents * quantity + item.setupFeeCents },
    });
    return;
  }

  const wanted = snapQuantity(product, variant, quantity);
  const priced = priceLine(product, variant, wanted, (item.options ?? {}) as ChosenOptions);

  await db.shopOrderItem.update({
    where: { id: itemId },
    data: {
      quantity: priced.quantity,
      unitPriceCents: priced.unitPriceCents,
      setupFeeCents: priced.setupFeeCents,
      lineTotalCents: priced.lineTotalCents,
    },
  });
}

/**
 * The reference a candidate puts in the e-transfer message.
 *
 * Random rather than sequential: it goes in an email message field, and a
 * running number would tell every customer how many orders the shop has taken.
 * Ambiguous characters are left out because people read these down a phone.
 */
export async function allocateOrderNumber(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 8; attempt++) {
    let suffix = "";
    for (const byte of randomBytes(6)) suffix += alphabet[byte % alphabet.length];
    const number = `HG-${year}-${suffix}`;

    const taken = await db.shopOrder.findUnique({ where: { number }, select: { id: true } });
    if (!taken) return number;
  }

  // Eight collisions against a 32^6 space means something is badly wrong; fall
  // back to something that cannot collide rather than looping forever.
  return `HG-${year}-${Date.now().toString(36).toUpperCase()}`;
}

/* ---------------------------------------------------------------- artwork --- */

/** 25 MB. Print-ready PDFs are large; the database column is bytea. */
export const ARTWORK_MAX_BYTES = 25 * 1024 * 1024;

const ARTWORK_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/tiff",
  "application/postscript", // .ai and .eps both arrive as this
  "application/zip",
  "application/x-zip-compressed",
];

/** Null when the file is fine; otherwise the sentence to show the candidate. */
export function artworkProblem(file: File): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > ARTWORK_MAX_BYTES) {
    return "That file is over 25 MB. Send a link to it in the notes instead, or flatten the PDF.";
  }
  if (!ARTWORK_TYPES.includes(file.type)) {
    return "Send a PDF, PNG, JPG, SVG, TIFF, AI, EPS, or a zip of them.";
  }
  return null;
}
