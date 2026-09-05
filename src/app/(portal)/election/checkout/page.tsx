import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/shop/auth";
import { draftOrderId } from "@/lib/shop/orders";
import { TAX_LABEL, productBySlug } from "@/lib/shop/catalog";
import { ETRANSFER_EMAIL } from "@/lib/shop/config";
import { formatCents } from "@/lib/money";
import { deleteArtwork } from "@/app/actions/shop";
import { ArtworkUploader } from "@/components/shop/artwork-uploader";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout — Election print, Holm Graphics" };

export default async function CheckoutPage() {
  const customer = await requireCustomer("/election/checkout");
  const orderId = await draftOrderId(customer.id);

  const [order, account] = await Promise.all([
    db.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        artwork: { orderBy: { uploadedAt: "asc" } },
      },
    }),
    db.shopCustomer.findUnique({ where: { id: customer.id } }),
  ]);

  if (!order || !account) redirect("/election/cart");
  if (order.items.length === 0) redirect("/election/cart");

  // Delivery is only worth offering if something in the cart can actually be
  // sent. A cart of signs is collected, and asking the question would only
  // invite an address nobody is going to use.
  const deliveryOffered = order.items.some(
    (item) => !productBySlug(item.productSlug)?.pickupOnly,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">Checkout</h1>
        <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
        <p className="mt-2 text-sm text-muted">
          Nothing is charged here. You are telling us what you want and where it goes.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <CheckoutForm
            defaults={{
              contactName: account.contactName,
              phone: account.phone,
              candidateName: account.candidateName,
              office: account.office,
              municipality: account.municipality,
              ward: account.ward,
              addressLine: account.addressLine,
              city: account.city,
              postalCode: account.postalCode,
              needsDesign: order.needsDesign,
              authorisationLine: order.authorisationLine,
            }}
            deliveryOffered={deliveryOffered}
          />

          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold tracking-tight">Files</h2>
            <p className="mt-1 text-sm text-muted">
              Optional now — you can send them from the order page afterwards, and most campaigns do.
            </p>
            <div className="mt-3">
              <ArtworkUploader orderId={order.id} />
            </div>

            {order.artwork.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {order.artwork.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raise/60 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{file.filename}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {(file.byteSize / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <form action={deleteArtwork}>
                      <input type="hidden" name="artworkId" value={file.id} />
                      <button type="submit" className="btn-ghost !py-1 text-xs">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Your order</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{item.productName}</span>
                    <span className="block text-xs text-muted">
                      {item.quantity} × {item.variantName}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatCents(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Printing</dt>
                <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
              </div>
              {order.designFeeCents > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Design</dt>
                  <dd className="tabular-nums">{formatCents(order.designFeeCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{TAX_LABEL}</dt>
                <dd className="tabular-nums">{formatCents(order.taxCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-extrabold">
                <dt>Estimated</dt>
                <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>

            <Link href="/election/cart" className="mt-3 inline-block text-xs text-muted underline">
              Change the cart
            </Link>
          </div>

          <div className="rounded-xl border border-line bg-raise/60 p-4 text-xs leading-relaxed text-muted">
            <p className="font-bold text-ink">Paying</p>
            <p className="mt-1">
              When we have quoted it, send an Interac e-transfer to{" "}
              <span className="font-medium text-ink">{ETRANSFER_EMAIL}</span> with your order number
              in the message — or settle up at the counter when you collect. Your order page will
              show the number and the total.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
