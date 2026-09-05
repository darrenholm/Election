import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/shop/auth";
import { cartItemCount } from "@/lib/shop/orders";
import { ETRANSFER_EMAIL, SHOP_NAME, SHOP_PHONE, SHOP_PICKUP_ADDRESS } from "@/lib/shop/config";
import { PortalNav } from "@/components/shop/portal-nav";

export const metadata: Metadata = {
  title: "Election Print — Holm Graphics",
  description:
    "Signs, post cards, door hangers, t-shirts, hoodies and decals for municipal candidates",
};

/**
 * The storefront's chrome.
 *
 * Nothing here is behind the sign-in gate that covers the campaign manager: a
 * candidate who has never dealt with this shop should be able to land on the
 * catalogue from a search result, price a run of signs, and only be asked who
 * they are when they want to put it in a cart.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  const cartCount = customer ? await cartItemCount(customer.id) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <PortalNav
        customer={customer ? { name: customer.contactName || customer.email } : null}
        cartCount={cartCount}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8 md:py-12">
        {children}
      </main>

      <footer className="no-print border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-x-10 gap-y-4 px-4 py-8 text-xs text-muted md:px-8">
          <div className="min-w-48">
            <p className="font-bold text-ink">{SHOP_NAME}</p>
            <p className="mt-1">Election print for municipal candidates.</p>
            {SHOP_PICKUP_ADDRESS ? <p className="mt-1">{SHOP_PICKUP_ADDRESS}</p> : null}
            {SHOP_PHONE ? <p className="mt-1">{SHOP_PHONE}</p> : null}
          </div>
          <div className="min-w-48">
            <p className="font-bold text-ink">Paying for an order</p>
            <p className="mt-1">
              Interac e-transfer to <span className="font-medium text-ink">{ETRANSFER_EMAIL}</span>,
              with your order number in the message — or at the counter when you collect.
            </p>
          </div>
          <div className="min-w-48">
            <p className="font-bold text-ink">Keep your receipts</p>
            <p className="mt-1">
              Campaign material is an election expense. Every order here has a
              printable receipt with what the Form 4 asks for on it.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
