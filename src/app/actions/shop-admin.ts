"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cents, oneOf, str } from "@/lib/form";
import { SHOP_ORDER_STATUSES } from "@/lib/enums";
import { requireShopStaff } from "@/lib/shop/auth";
import { recalcOrder } from "@/lib/shop/orders";

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
