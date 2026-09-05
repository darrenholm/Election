import Link from "next/link";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/shop/auth";
import { draftOrderId } from "@/lib/shop/orders";
import {
  ARTWORK_PREP_CENTS,
  DESIGN_FEE_CENTS,
  TAX_LABEL,
  productBySlug,
  variantByKey,
} from "@/lib/shop/catalog";
import { formatCents } from "@/lib/money";
import { removeCartItem, setDesignService, updateCartItem } from "@/app/actions/shop";
import { EmptyState } from "@/components/ui";
import { describeLine } from "@/lib/shop/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your cart — Election print, Holm Graphics" };

export default async function CartPage() {
  const customer = await requireCustomer("/election/cart");
  const orderId = await draftOrderId(customer.id);

  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return null;

  const hasItems = order.items.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">Your cart</h1>
        <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
      </header>

      {!hasItems ? (
        <EmptyState
          title="Nothing in the cart yet"
          hint="Price up a run of signs or a box of door hangers and they will land here."
          action={
            <Link href="/election" className="btn-primary">
              See the catalogue
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {order.items.map((item) => {
              const sizes = (item.sizeBreakdown ?? null) as Record<string, number> | null;
              // Signs are sold in lots, so the box says so rather than silently
              // rounding a typed 40 up to the 48 that can actually be made.
              const product = productBySlug(item.productSlug);
              const lotSize =
                (product ? variantByKey(product, item.variantKey)?.signsPerSheet : 0) ?? 0;
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-line bg-surface p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">
                        {item.productName}
                        <span className="font-normal text-muted"> · {item.variantName}</span>
                      </p>
                      {item.optionsSummary ? (
                        <p className="mt-0.5 text-sm text-muted">{item.optionsSummary}</p>
                      ) : null}
                      {item.artworkNote ? (
                        <p className="mt-1 text-xs italic text-muted">“{item.artworkNote}”</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold tabular-nums">
                        {formatCents(item.lineTotalCents)}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        {describeLine(item)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                    {sizes ? (
                      <p className="text-xs text-muted">
                        Size run fixed at{" "}
                        {Object.entries(sizes)
                          .map(([size, count]) => `${count} × ${size}`)
                          .join(", ")}
                        . To change it, remove the line and add it again.
                      </p>
                    ) : (
                      <form action={updateCartItem} className="flex items-center gap-2">
                        <input type="hidden" name="itemId" value={item.id} />
                        <label className="text-xs text-muted">
                          Quantity
                          <input
                            type="number"
                            name="quantity"
                            min={lotSize > 0 ? lotSize : 1}
                            step={lotSize > 0 ? lotSize : 1}
                            defaultValue={item.quantity}
                            className="field ml-2 inline-block w-24 tabular-nums"
                          />
                        </label>
                        <button type="submit" className="btn-secondary !py-1.5 text-xs">
                          Update
                        </button>
                        {lotSize > 1 ? (
                          <span className="text-xs text-muted">in lots of {lotSize}</span>
                        ) : null}
                      </form>
                    )}

                    <form action={removeCartItem} className="ml-auto">
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className="btn-ghost !py-1.5 text-xs">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>

          <form
            action={setDesignService}
            className="rounded-xl border border-line bg-raise/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <p className="text-sm font-bold">Have us design it</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  One flat {formatCents(DESIGN_FEE_CENTS)} for the whole order, however many pieces
                  are on it — the point is that the signs, the cards and the shirts look like one
                  campaign. It is charged once, where setting up artwork you send us is{" "}
                  {formatCents(ARTWORK_PREP_CENTS)} on each item, so on an order of two or more this
                  is usually the cheaper way round. Leave it off only if you are sending
                  print-ready files.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="needsDesign"
                  name="needsDesign"
                  defaultChecked={order.needsDesign}
                  className="size-4 rounded border-line accent-[var(--color-brand)]"
                />
                <label htmlFor="needsDesign" className="text-sm font-medium">
                  Yes, design it
                </label>
                <button type="submit" className="btn-secondary !py-1.5 text-xs">
                  Apply
                </button>
              </div>
            </div>
          </form>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Printing</dt>
                <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
              </div>
              {order.designFeeCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Design</dt>
                  <dd className="tabular-nums">{formatCents(order.designFeeCents)}</dd>
                </div>
              ) : null}
              {order.deliveryCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Shipping</dt>
                  <dd className="tabular-nums">{formatCents(order.deliveryCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{TAX_LABEL}</dt>
                <dd className="tabular-nums">{formatCents(order.taxCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-extrabold">
                <dt>Estimated total</dt>
                <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              {order.deliveryCents > 0
                ? "That delivery line is a run we have agreed to make. Otherwise there is nothing to pay for shipping: the price of the cards and hangers covers getting them here, and the signs and decals are made here."
                : "Nothing further to pay for shipping. Cards and hangers are printed for us and the price covers getting them here; signs and decals are made here. It is all collected from the shop."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/election/checkout" className="btn-primary">
              Continue to checkout
            </Link>
            <Link href="/election" className="btn-secondary">
              Keep shopping
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
