import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireShopStaff } from "@/lib/shop/auth";
import {
  SHOP_FULFILMENTS,
  SHOP_ORDER_STATUSES,
  SHOP_ORDER_STATUS_OPTIONS,
  SHOP_PAYMENT_STATUSES,
  label,
} from "@/lib/enums";
import { TAX_LABEL } from "@/lib/shop/catalog";
import { ETRANSFER_EMAIL } from "@/lib/shop/config";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { quoteOrder, recordPayment, setOrderStatus } from "@/app/actions/shop-admin";
import { productBySlug, variantByKey } from "@/lib/shop/catalog";
import { floorPriceCents } from "@/lib/shop/fulfilment";
import { sinaliteConfig } from "@/lib/shop/sinalite";
import { isVendorProduct } from "@/lib/shop/vendor-map";
import {
  TradeCard,
  type ShippingOptionView,
  type TradeLineView,
} from "@/components/shop/trade-card";
import { Badge, Card, Field, Note, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Cents back into the plain number a money input wants. */
function toAmountInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default async function ShopOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireShopStaff();
  const { id } = await params;

  const order = await db.shopOrder.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      artwork: { orderBy: { uploadedAt: "asc" } },
      customer: { select: { email: true, lastSignInAt: true } },
    },
  });
  if (!order || order.status === "DRAFT") notFound();

  const owing = order.totalCents - order.paidCents;

  // The bought-in half of the order, with what each line costs us against what
  // it was sold for. The floor is trade cost doubled plus our file-prep charge.
  const tradeLines: TradeLineView[] = order.items
    .filter((item) => isVendorProduct(item.productSlug))
    .map((item) => {
      const product = productBySlug(item.productSlug);
      const variant = product ? variantByKey(product, item.variantKey) : null;
      return {
        id: item.id,
        description: `${item.quantity} × ${item.productName} · ${item.variantName}`,
        costCents: item.vendorCostCents,
        chargedCents: item.lineTotalCents,
        floorCents: floorPriceCents(item.vendorCostCents, variant?.setupFeeCents ?? item.setupFeeCents),
      };
    });

  const shippingOptions = ((order.vendorShipOptions ?? []) as ShippingOptionView[]).filter(
    (option) => typeof option?.priceCents === "number",
  );

  return (
    <>
      <PageHeader
        title={order.number ?? "Order"}
        subtitle={
          <>
            {order.candidateName} · {order.municipality}
            {order.ward ? `, ${order.ward}` : ""} · placed{" "}
            {order.submittedAt ? formatDate(order.submittedAt) : "—"}
          </>
        }
        actions={
          <Link href="/shop" className="btn-secondary">
            Back to the queue
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={order.status === "CANCELLED" ? "bad" : "brand"}>
          {label(SHOP_ORDER_STATUSES, order.status)}
        </Badge>
        <Badge tone={order.paymentStatus === "PAID" ? "good" : "warn"}>
          {label(SHOP_PAYMENT_STATUSES, order.paymentStatus)}
        </Badge>
        <Badge>{label(SHOP_FULFILMENTS, order.fulfilment)}</Badge>
        {order.needsDesign ? <Badge tone="warn">Design service</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card title="The job">
            <ul className="divide-y divide-line">
              {order.items.map((item) => {
                const sizes = (item.sizeBreakdown ?? null) as Record<string, number> | null;
                return (
                  <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm first:pt-0">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.quantity} × {item.productName}
                        <span className="font-normal text-muted"> · {item.variantName}</span>
                      </p>
                      {item.optionsSummary ? (
                        <p className="mt-0.5 text-xs text-muted">{item.optionsSummary}</p>
                      ) : null}
                      {sizes ? (
                        <p className="mt-0.5 text-xs text-muted">
                          {Object.entries(sizes)
                            .map(([size, count]) => `${count} × ${size}`)
                            .join(", ")}
                        </p>
                      ) : null}
                      {item.artworkNote ? (
                        <p className="mt-0.5 text-xs italic text-muted">“{item.artworkNote}”</p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">
                        {formatCents(item.lineTotalCents)}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        {formatCents(item.unitPriceCents)} ea
                        {item.setupFeeCents > 0
                          ? ` + ${formatCents(item.setupFeeCents)} setup`
                          : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card
            title="Quote"
            description="Price the delivery and anything you are taking off. Saving a submitted order quotes it back to the candidate."
          >
            <form action={quoteOrder} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Delivery">
                  <input
                    name="deliveryCents"
                    defaultValue={toAmountInput(order.deliveryCents)}
                    inputMode="decimal"
                    className="field tabular-nums"
                  />
                </Field>
                <Field label="Adjustment" hint="Negative for a discount.">
                  <input
                    name="adjustmentCents"
                    defaultValue={toAmountInput(order.adjustmentCents)}
                    inputMode="decimal"
                    className="field tabular-nums"
                  />
                </Field>
                <Field label="What the adjustment is">
                  <input
                    name="adjustmentNote"
                    defaultValue={order.adjustmentNote}
                    placeholder="Returning customer"
                    className="field"
                  />
                </Field>
              </div>
              <Field label="Shop notes" hint="Never shown to the candidate.">
                <textarea name="staffNotes" rows={2} defaultValue={order.staffNotes} className="field" />
              </Field>
              <button type="submit" className="btn-primary">
                Save and quote
              </button>
            </form>
          </Card>

          <Card title="Files">
            {order.artwork.length === 0 ? (
              <p className="text-sm text-muted">Nothing sent in.</p>
            ) : (
              <ul className="space-y-2">
                {order.artwork.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raise/60 px-3 py-2 text-sm"
                  >
                    <a
                      href={`/api/shop/artwork/${file.id}`}
                      className="min-w-0 truncate font-medium underline"
                    >
                      {file.filename}
                    </a>
                    <span className="text-xs text-muted tabular-nums">
                      {(file.byteSize / 1024 / 1024).toFixed(1)} MB ·{" "}
                      {formatDateTime(file.uploadedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {tradeLines.length > 0 ? (
            <TradeCard
              orderId={order.id}
              configured={sinaliteConfig().configured}
              lines={tradeLines}
              shippingOptions={shippingOptions}
              order={order}
            />
          ) : null}

          {order.designBrief || order.notes || order.authorisationLine ? (
            <Card title="What they told us">
              {order.authorisationLine ? (
                <p className="text-sm">
                  <span className="font-semibold">Authorisation line: </span>
                  {order.authorisationLine}
                </p>
              ) : null}
              {order.designBrief ? (
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Design brief: </span>
                  {order.designBrief}
                </p>
              ) : null}
              {order.notes ? (
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Notes: </span>
                  {order.notes}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card title="Money">
            <dl className="space-y-1.5 text-sm">
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
              {order.deliveryCents > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="tabular-nums">{formatCents(order.deliveryCents)}</dd>
                </div>
              ) : null}
              {order.adjustmentCents !== 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{order.adjustmentNote || "Adjustment"}</dt>
                  <dd className="tabular-nums">{formatCents(order.adjustmentCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{TAX_LABEL}</dt>
                <dd className="tabular-nums">{formatCents(order.taxCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-extrabold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Received</dt>
                <dd className="tabular-nums">{formatCents(order.paidCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Outstanding</dt>
                <dd className="tabular-nums">{formatCents(owing)}</dd>
              </div>
            </dl>

            <form action={recordPayment} className="mt-4 space-y-2 border-t border-line pt-3">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Record an e-transfer" hint={`Arrives at ${ETRANSFER_EMAIL}.`}>
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder={toAmountInput(Math.max(owing, 0))}
                  className="field tabular-nums"
                />
              </Field>
              <button type="submit" className="btn-secondary w-full">
                Add payment
              </button>
            </form>
          </Card>

          <Card title="Stage">
            <form action={setOrderStatus} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <Select
                name="status"
                options={SHOP_ORDER_STATUS_OPTIONS.filter((o) => o.value !== "DRAFT")}
                defaultValue={order.status}
              />
              <button type="submit" className="btn-secondary w-full">
                Move it
              </button>
            </form>
          </Card>

          <Card title="Who">
            <p className="text-sm font-semibold">{order.contactName}</p>
            <p className="text-sm text-muted">{order.phone}</p>
            <p className="text-sm text-muted">{order.customer.email}</p>
            {order.fulfilment === "DELIVERY" ? (
              <p className="mt-2 text-sm">
                {order.addressLine}
                <br />
                {order.city} {order.postalCode}
              </p>
            ) : null}
            {order.neededBy ? (
              <p className="mt-2 text-sm">
                <span className="font-semibold">Needed by </span>
                {formatDate(order.neededBy)}
              </p>
            ) : null}
          </Card>

          <Note>
            Payment is by e-transfer, so nothing here moves on its own. Someone has to see the money
            arrive and record it.
          </Note>
        </aside>
      </div>
    </>
  );
}
