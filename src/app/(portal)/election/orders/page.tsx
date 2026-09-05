import Link from "next/link";
import { db } from "@/lib/db";
import { requireCustomer } from "@/lib/shop/auth";
import { SHOP_ORDER_STATUSES, SHOP_PAYMENT_STATUSES, label } from "@/lib/enums";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your orders — Election print, Holm Graphics" };

export default async function OrdersPage() {
  const customer = await requireCustomer("/election/orders");

  const orders = await db.shopOrder.findMany({
    where: { customerId: customer.id, status: { not: "DRAFT" } },
    orderBy: { submittedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
          Your orders
        </h1>
        <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
      </header>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Once you send one over it will sit here, with its proof, its receipt and a button to run it again."
          action={
            <Link href="/election" className="btn-primary">
              See the catalogue
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/election/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm hover:border-brand/50 hover:bg-raise"
              >
                <div className="min-w-0">
                  <p className="font-bold tabular-nums">{order.number}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {order.submittedAt ? formatDate(order.submittedAt) : "—"} ·{" "}
                    {order._count.items} {order._count.items === 1 ? "line" : "lines"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={order.status === "COMPLETED" ? "good" : "brand"}>
                    {label(SHOP_ORDER_STATUSES, order.status)}
                  </Badge>
                  <Badge tone={order.paymentStatus === "PAID" ? "good" : "warn"}>
                    {label(SHOP_PAYMENT_STATUSES, order.paymentStatus)}
                  </Badge>
                  <span className="w-24 text-right font-extrabold tabular-nums">
                    {formatCents(order.totalCents)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
