import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/shop/auth";
import {
  SHOP_FULFILMENTS,
  SHOP_ORDER_STATUSES,
  SHOP_PAYMENT_STATUSES,
  label,
  type ShopOrderStatus,
} from "@/lib/enums";
import { TAX_LABEL } from "@/lib/shop/catalog";
import { ETRANSFER_EMAIL, SHOP_NAME } from "@/lib/shop/config";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteArtwork, reorder } from "@/app/actions/shop";
import { ArtworkUploader } from "@/components/shop/artwork-uploader";
import { Badge, Note } from "@/components/ui";

export const dynamic = "force-dynamic";

/** The path an order walks, for the little progress strip. */
const JOURNEY: ShopOrderStatus[] = [
  "SUBMITTED",
  "QUOTED",
  "IN_PRODUCTION",
  "READY",
  "COMPLETED",
];

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;
  const customer = await requireCustomer();

  const order = await db.shopOrder.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      artwork: { orderBy: { uploadedAt: "asc" } },
    },
  });

  // An order id is not a permission: this is the check that makes editing the
  // URL pointless rather than interesting.
  if (!order || order.customerId !== customer.id) notFound();
  if (order.status === "DRAFT") return null;

  const owing = order.totalCents - order.paidCents;
  const stage = JOURNEY.indexOf(order.status as ShopOrderStatus);

  return (
    <div className="space-y-6">
      {placed ? (
        <div className="rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm text-brand-ink">
          <p className="font-bold">That is with us.</p>
          <p className="mt-1 leading-relaxed">
            We will price the delivery if you asked for it, check any files you sent, and quote it
            back — usually the same working day. Nothing to pay until then.
          </p>
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Order</p>
          <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] tabular-nums">
            {order.number}
          </h1>
          <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
          <p className="mt-2 text-sm text-muted">
            Placed {order.submittedAt ? formatDate(order.submittedAt) : "—"} ·{" "}
            {label(SHOP_FULFILMENTS, order.fulfilment)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Badge tone={order.status === "CANCELLED" ? "bad" : "brand"}>
            {label(SHOP_ORDER_STATUSES, order.status)}
          </Badge>
          <Badge tone={order.paymentStatus === "PAID" ? "good" : "warn"}>
            {label(SHOP_PAYMENT_STATUSES, order.paymentStatus)}
          </Badge>
        </div>
      </header>

      {stage >= 0 ? (
        <ol className="no-print flex flex-wrap gap-1.5 text-xs">
          {JOURNEY.map((step, index) => (
            <li
              key={step}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                index < stage
                  ? "bg-brand-soft text-brand-ink"
                  : index === stage
                    ? "bg-brand text-white"
                    : "bg-raise text-muted"
              }`}
            >
              {label(SHOP_ORDER_STATUSES, step)}
            </li>
          ))}
        </ol>
      ) : null}

      {order.vendorTracking ? (
        <section className="rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm text-brand-ink">
          <p className="font-bold">On its way</p>
          <p className="mt-1">
            Tracking number{" "}
            <span className="font-semibold tabular-nums">{order.vendorTracking}</span>
            {order.vendorShipCarrier ? ` with ${order.vendorShipCarrier}` : ""}.
          </p>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- paying */}
      {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" ? (
        <section className="rounded-xl border border-accent/40 bg-accent-soft p-5">
          <h2 className="text-sm font-bold text-accent-ink">
            {order.status === "SUBMITTED" ? "Payment — once we have quoted it" : "Payment"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-accent-ink">
            Send an Interac e-transfer to{" "}
            <span className="font-bold">{ETRANSFER_EMAIL}</span> for{" "}
            <span className="font-bold tabular-nums">{formatCents(owing)}</span>, and put{" "}
            <span className="font-bold tabular-nums">{order.number}</span> in the message so it
            lands against this job.
            {order.fulfilment === "PICKUP" ? (
              <> Or settle up at the counter when you collect — either is fine.</>
            ) : null}
          </p>
          {order.status === "SUBMITTED" && order.fulfilment === "DELIVERY" ? (
            <p className="mt-2 text-xs text-accent-ink">
              The figure above does not include delivery yet. Wait for the quote before sending
              anything.
            </p>
          ) : null}
          {order.paidCents > 0 ? (
            <p className="mt-2 text-xs font-medium text-accent-ink tabular-nums">
              {formatCents(order.paidCents)} received so far.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------------ lines */}
      <section className="rounded-xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line bg-raise/60 px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight">{SHOP_NAME} — what we are printing</h2>
          <p className="mt-0.5 text-xs text-muted">
            For {order.candidateName}, {order.municipality}
            {order.ward ? `, ${order.ward}` : ""}
          </p>
        </div>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  {item.productName}
                  <span className="font-normal text-muted"> · {item.variantName}</span>
                </p>
                {item.optionsSummary ? (
                  <p className="mt-0.5 text-xs text-muted">{item.optionsSummary}</p>
                ) : null}
                {item.artworkNote ? (
                  <p className="mt-0.5 text-xs italic text-muted">“{item.artworkNote}”</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatCents(item.lineTotalCents)}</p>
                <p className="text-xs text-muted tabular-nums">
                  {item.quantity} × {formatCents(item.unitPriceCents)}
                  {item.setupFeeCents > 0 ? ` + ${formatCents(item.setupFeeCents)} setup` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
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
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-extrabold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <Note>
        Keep this for your financial statement. It shows the supplier, the date, what was bought and
        the tax — which is what the filing asks for. Printing this page gives you a receipt.
      </Note>

      {/* ---------------------------------------------------------- artwork */}
      <section className="no-print rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold tracking-tight">Files</h2>
        {order.needsDesign ? (
          <p className="mt-1 text-sm text-muted">
            We are designing this one. Anything you send here — a photo, an old sign, a logo — helps.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Send print-ready files here. We check them before anything goes on press.
          </p>
        )}

        {["DRAFT", "SUBMITTED", "QUOTED"].includes(order.status) ? (
          <div className="mt-3">
            <ArtworkUploader orderId={order.id} />
          </div>
        ) : null}

        {order.artwork.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {order.artwork.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raise/60 px-3 py-2 text-sm"
              >
                <a
                  href={`/api/shop/artwork/${file.id}`}
                  className="min-w-0 truncate font-medium underline hover:text-brand-ink"
                >
                  {file.filename}
                </a>
                <span className="text-xs text-muted tabular-nums">
                  {(file.byteSize / 1024 / 1024).toFixed(1)} MB
                </span>
                {["DRAFT", "SUBMITTED", "QUOTED"].includes(order.status) ? (
                  <form action={deleteArtwork}>
                    <input type="hidden" name="artworkId" value={file.id} />
                    <button type="submit" className="btn-ghost !py-1 text-xs">
                      Remove
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted">Nothing sent in yet.</p>
        )}
      </section>

      {order.notes || order.designBrief || order.authorisationLine ? (
        <section className="rounded-xl border border-line bg-raise/60 p-4 text-sm">
          {order.authorisationLine ? (
            <p>
              <span className="font-semibold">Authorisation line: </span>
              {order.authorisationLine}
            </p>
          ) : null}
          {order.designBrief ? (
            <p className="mt-2">
              <span className="font-semibold">Design brief: </span>
              {order.designBrief}
            </p>
          ) : null}
          {order.notes ? (
            <p className="mt-2">
              <span className="font-semibold">Notes: </span>
              {order.notes}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="no-print flex flex-wrap gap-3">
        <form action={reorder}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="btn-secondary">
            Order this again
          </button>
        </form>
        <Link href="/election/orders" className="btn-ghost">
          All orders
        </Link>
      </div>
    </div>
  );
}
