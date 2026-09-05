"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cents, oneOf, str } from "@/lib/form";
import { SHOP_ORDER_STATUSES } from "@/lib/enums";
import { requireShopStaff } from "@/lib/shop/auth";
import { recalcOrder } from "@/lib/shop/orders";
import {
  quoteOrderWithVendor,
  recordVendorTracking,
  sendOrderToVendor,
} from "@/lib/shop/fulfilment";

/**
 * The shop's side of the portal: quoting, moving a job along, and marking the
 * money in.
 *
 * Every action starts by re-checking that the caller is an administrator. The
 * queue holds every candidate's spending, including that of people running
 * against each other, so it is the one part of this portal that is not merely
 * hidden from the wrong person.
 */

function refresh(orderId: string) {
  revalidatePath("/shop");
  revalidatePath(`/shop/${orderId}`);
  revalidatePath(`/election/orders/${orderId}`);
  revalidatePath("/election/orders");
}

/**
 * Set the delivery charge and any adjustment, and quote it back.
 *
 * This is the step the customer is waiting on: until delivery is priced, the
 * total on their page is an estimate. Saving it re-adds the order up and moves
 * a submitted job to QUOTED, so the e-transfer instructions on their page start
 * naming a figure that is actually the price.
 */
export async function quoteOrder(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return;

  await db.shopOrder.update({
    where: { id: order.id },
    data: {
      deliveryCents: cents(formData, "deliveryCents", 0),
      adjustmentCents: cents(formData, "adjustmentCents", 0),
      adjustmentNote: str(formData, "adjustmentNote"),
      staffNotes: str(formData, "staffNotes"),
    },
  });

  await recalcOrder(order.id);

  if (order.status === "SUBMITTED") {
    await db.shopOrder.update({
      where: { id: order.id },
      data: { status: "QUOTED", quotedAt: new Date() },
    });
  }

  refresh(order.id);
}

export async function setOrderStatus(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const status = oneOf(formData, "status", SHOP_ORDER_STATUSES, "SUBMITTED");

  // DRAFT is the customer's cart. Putting a submitted job back into one would
  // hand it back to them mid-production, so it is not on offer here.
  if (status === "DRAFT") return;

  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      status,
      quotedAt: status === "QUOTED" ? new Date() : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
    },
  });

  refresh(orderId);
}

/**
 * Record money that has landed.
 *
 * E-transfers arrive in an inbox, not in a webhook, so this is somebody at the
 * shop typing in what they have seen. Amounts add up rather than replace, which
 * is what a deposit followed by a balance actually looks like.
 */
export async function recordPayment(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { id: true, paidCents: true, totalCents: true },
  });
  if (!order) return;

  const received = cents(formData, "amount", 0);
  if (received === 0) return;

  const paidCents = Math.max(0, order.paidCents + received);
  const paymentStatus = paidCents >= order.totalCents ? "PAID" : paidCents > 0 ? "PARTIAL" : "UNPAID";

  await db.shopOrder.update({
    where: { id: order.id },
    data: {
      paidCents,
      paymentStatus,
      paidAt: paymentStatus === "PAID" ? new Date() : null,
    },
  });

  refresh(order.id);
}

export async function saveStaffNotes(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  await db.shopOrder.update({
    where: { id: orderId },
    data: { staffNotes: str(formData, "staffNotes") },
  });

  refresh(orderId);
}

/* ------------------------------------------------------- trade fulfilment */

/**
 * Ask SinaLite what the bought-in lines cost, and what freight would be.
 *
 * Deliberately separate from quoteOrder() above, which is what the candidate
 * sees. This one is about margin: it tells the shop what the job costs and what
 * it would have to sell for, and the shop decides what to do about it.
 */
export async function priceWithVendor(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  await quoteOrderWithVendor(orderId);
  refresh(orderId);
}

/** Take a dearer, faster service than the cheapest one the quote defaulted to. */
export async function chooseVendorShipping(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const [carrier, method, priceRaw] = str(formData, "service").split("|");
  if (!method) return;

  const priceCents = Number(priceRaw);
  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      vendorShipCarrier: carrier ?? "",
      vendorShipMethod: method,
      vendorShippingCents: Number.isFinite(priceCents) ? priceCents : 0,
    },
  });

  refresh(orderId);
}

/**
 * Send the job to press.
 *
 * A button rather than something that fires on payment: the artwork is looked
 * at by eye first, which is most of what the file-prep charge pays for.
 */
export async function sendToVendor(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  await sendOrderToVendor(orderId);
  refresh(orderId);
}

/**
 * Type in the tracking number from their dispatch email.
 *
 * There is no order-status endpoint in SinaLite's API, so this is how a
 * candidate gets to see where their signs are.
 */
export async function saveVendorTracking(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  await recordVendorTracking(orderId, str(formData, "tracking"), str(formData, "vendorStatus"));
  refresh(orderId);
}

/**
 * Type in what the trade printer charged, line by line.
 *
 * The manual counterpart of priceWithVendor(): the same figures, arrived at by
 * reading them off the printer's own website rather than asking their API. It
 * feeds the same floor and margin arithmetic, so an order placed by hand is as
 * legible in the queue as one placed through the API — which matters, because a
 * shop takes orders before it has credentials and goes on placing the odd job
 * by hand long afterwards.
 */
export async function recordVendorCosts(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { id: true, vendor: true, items: { select: { id: true } } },
  });
  if (!order) return;

  let goodsCents = 0;
  for (const item of order.items) {
    // Only the lines the form carried; a line with no field is left alone.
    const raw = str(formData, `cost_${item.id}`);
    if (raw === "") continue;

    const costCents = cents(formData, `cost_${item.id}`, 0);
    await db.shopOrderItem.update({ where: { id: item.id }, data: { vendorCostCents: costCents } });
    goodsCents += costCents;
  }

  await db.shopOrder.update({
    where: { id: order.id },
    data: {
      vendor: order.vendor === "NONE" ? "SINALITE" : order.vendor,
      vendorCostCents: goodsCents,
      vendorShippingCents: cents(formData, "vendorShippingCents", 0),
      vendorQuotedAt: new Date(),
    },
  });

  refresh(order.id);
}

/**
 * Mark a job as placed by hand, with whatever reference the printer gave back.
 *
 * The same fields the API path fills in, so the queue, the candidate's page and
 * the tracking number all behave identically whichever way the job went over.
 */
export async function recordManualVendorOrder(formData: FormData) {
  await requireShopStaff();

  const orderId = str(formData, "orderId");
  const reference = str(formData, "vendorOrderId");
  if (reference === "") return;

  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      vendor: "SINALITE",
      vendorManual: true,
      vendorOrderId: reference,
      vendorStatus: str(formData, "vendorStatus") || "Placed by hand",
      vendorShipMethod: str(formData, "vendorShipMethod"),
      vendorSentAt: new Date(),
      vendorError: "",
    },
  });

  refresh(orderId);
}
