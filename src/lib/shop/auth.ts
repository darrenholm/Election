import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SHOP_SESSION_COOKIE, readShopSessionToken } from "./session";

/**
 * Who is signed in to the print portal, and what they may reach.
 *
 * The rule this file exists to enforce is the same one src/lib/auth.ts enforces
 * next door, in a different currency: a customer sees their own orders and
 * nobody else's. Two candidates running in the same ward both order signs from
 * this shop, and what each is spending is not the other's business.
 *
 * An order id is not a permission. Every action handed one resolves the order's
 * customer and re-checks it against the session, in requireOwnOrder() below.
 */

export type SignedInCustomer = {
  id: string;
  email: string;
  contactName: string;
  candidateName: string;
  municipality: string;
};

export const getCurrentCustomer = cache(async (): Promise<SignedInCustomer | null> => {
  const jar = await cookies();
  const customerId = readShopSessionToken(jar.get(SHOP_SESSION_COOKIE)?.value);
  if (!customerId) return null;

  const customer = await db.shopCustomer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      contactName: true,
      candidateName: true,
      municipality: true,
      isActive: true,
    },
  });

  // A closed account keeps its valid cookie until it expires, so this is
  // re-checked on every read rather than only at sign-in.
  if (!customer || !customer.isActive) return null;

  return {
    id: customer.id,
    email: customer.email,
    contactName: customer.contactName,
    candidateName: customer.candidateName,
    municipality: customer.municipality,
  };
});

/** For pages and actions that make no sense signed out. */
export async function requireCustomer(next?: string): Promise<SignedInCustomer> {
  const customer = await getCurrentCustomer();
  if (customer) return customer;
  redirect(next ? `/election/sign-in?next=${encodeURIComponent(next)}` : "/election/sign-in");
}

/**
 * One of this customer's orders, or a redirect. Resolving the order's owner and
 * comparing it to the session is the whole point — a customer who edits an id
 * in a URL gets their own order list, not somebody else's job.
 */
export async function requireOwnOrder(orderId: string) {
  const customer = await requireCustomer();
  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { id: true, customerId: true, status: true },
  });
  if (!order || order.customerId !== customer.id) redirect("/election/orders");
  return { customer, order };
}

/**
 * The shop's side of the portal.
 *
 * Administrators only. The campaign manager's other roles belong to candidates
 * and their volunteers, and the order queue holds every candidate's spending —
 * including that of people running against each other.
 */
export async function isShopStaff(): Promise<boolean> {
  return (await getCurrentUser())?.isAdmin === true;
}

export async function requireShopStaff(): Promise<void> {
  if (!(await isShopStaff())) redirect("/");
}
