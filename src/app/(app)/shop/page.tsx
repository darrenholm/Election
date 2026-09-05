import Link from "next/link";
import { db } from "@/lib/db";
import { requireShopStaff } from "@/lib/shop/auth";
import {
  OPEN_SHOP_ORDER_STATUSES,
  SHOP_ORDER_STATUSES,
  SHOP_PAYMENT_STATUSES,
  label,
} from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ETRANSFER_EMAIL } from "@/lib/shop/config";
import { garmentStyles } from "@/lib/shop/garments";
import { Badge, Card, EmptyState, PageHeader, StatTile, Table, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The print queue.
 *
 * What the shop looks at in the morning: what came in overnight, what has been
 * quoted but not paid, and what is due to go on press. Administrators only —
 * candidates running against each other both order from here.
 */
export default async function ShopQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireShopStaff();
  const { show } = await searchParams;
  const showAll = show === "all";

  const [orders, awaitingQuote, unpaidCents, customers, garments] = await Promise.all([
    db.shopOrder.findMany({
      where: showAll
        ? { status: { not: "DRAFT" } }
        : { status: { in: OPEN_SHOP_ORDER_STATUSES } },
      orderBy: [{ submittedAt: "desc" }],
      include: { _count: { select: { items: true, artwork: true } } },
      take: 200,
    }),
    db.shopOrder.count({ where: { status: "SUBMITTED" } }),
    db.shopOrder.aggregate({
      where: { status: { in: OPEN_SHOP_ORDER_STATUSES }, paymentStatus: { not: "PAID" } },
      _sum: { totalCents: true, paidCents: true },
    }),
    db.shopCustomer.count(),
    garmentStyles(),
  ]);

  const owing = (unpaidCents._sum.totalCents ?? 0) - (unpaidCents._sum.paidCents ?? 0);

  return (
    <>
      <PageHeader
        title="Print orders"
        subtitle="What candidates have ordered from the election portal, and what stage each job is at."
        actions={
          <Link href={showAll ? "/shop" : "/shop?show=all"} className="btn-secondary">
            {showAll ? "Open jobs only" : "Show everything"}
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Waiting on a quote"
          value={awaitingQuote}
          tone={awaitingQuote > 0 ? "warn" : "neutral"}
          hint="Submitted, delivery not yet priced"
        />
        <StatTile label="Outstanding" value={formatCents(owing)} hint={`E-transfers to ${ETRANSFER_EMAIL}`} />
        <StatTile label="Accounts" value={customers} hint="Candidates registered on the portal" />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title={showAll ? "No orders yet" : "Nothing open"}
          hint="Orders placed on the election portal land here the moment they are submitted."
        />
      ) : (
        <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Candidate</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-raise">
                  <Td>
                    <Link href={`/shop/${order.id}`} className="font-semibold tabular-nums underline">
                      {order.number}
                    </Link>
                    <span className="block text-xs text-muted">
                      {order._count.items} {order._count.items === 1 ? "line" : "lines"}
                      {order._count.artwork > 0 ? ` · ${order._count.artwork} file(s)` : ""}
                      {order.needsDesign ? " · design" : ""}
                    </span>
                  </Td>
                  <Td>
                    {order.candidateName}
                    <span className="block text-xs text-muted">
                      {order.municipality}
                      {order.ward ? `, ${order.ward}` : ""}
                    </span>
                  </Td>
                  <Td>{order.submittedAt ? formatDate(order.submittedAt) : "—"}</Td>
                  <Td>
                    <Badge tone={order.status === "CANCELLED" ? "bad" : "brand"}>
                      {label(SHOP_ORDER_STATUSES, order.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={order.paymentStatus === "PAID" ? "good" : "warn"}>
                      {label(SHOP_PAYMENT_STATUSES, order.paymentStatus)}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <span className="font-semibold tabular-nums">
                      {formatCents(order.totalCents)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
        </Table>
      )}

      {/* What garment data is loaded. Apparel cannot be sold without it — the
          storefront takes its colours, sizes and prices from these rows. */}
      <div className="mt-6">
        <Card
          title="Garment data"
          description="Colours, sizes and costs for the SanMar styles."
          actions={
            <Link href="/shop/suppliers" className="btn-secondary">
              Suppliers
            </Link>
          }
        >
          {garments.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing loaded yet, so no apparel can be priced or sold.{" "}
              <Link href="/shop/suppliers" className="font-semibold underline">
                Load it from SanMar
              </Link>
              , or import a CSV export from the dealer portal.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {garments.map((style) => (
                <li key={style.styleCode} className="flex flex-wrap justify-between gap-3">
                  <span className="font-medium">
                    {style.styleCode}
                    <span className="ml-2 font-normal text-muted">{style.name}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {style.skuCount} sizes · {style.source.toLowerCase()} ·{" "}
                    {style.syncedAt ? formatDate(style.syncedAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
