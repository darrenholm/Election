import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, Field, Note } from "@/components/ui";
import {
  chooseVendorShipping,
  priceWithVendor,
  saveVendorTracking,
  sendToVendor,
} from "@/app/actions/shop-admin";

/**
 * The trade printer's half of an order, in the shop's queue.
 *
 * Only appears on orders carrying bought-in lines. It answers three questions
 * in the order they get asked: what does this cost us, is what we charged still
 * above the floor, and has it gone to press yet.
 */

export type TradeLineView = {
  id: string;
  description: string;
  costCents: number;
  chargedCents: number;
  floorCents: number;
};

export type ShippingOptionView = {
  carrier: string;
  method: string;
  priceCents: number;
  days: number | null;
};

export function TradeCard({
  orderId,
  configured,
  lines,
  shippingOptions,
  order,
}: {
  orderId: string;
  configured: boolean;
  lines: TradeLineView[];
  shippingOptions: ShippingOptionView[];
  order: {
    vendorOrderId: string;
    vendorStatus: string;
    vendorTracking: string;
    vendorCostCents: number;
    vendorShippingCents: number;
    vendorShipCarrier: string;
    vendorShipMethod: string;
    vendorQuotedAt: Date | null;
    vendorSentAt: Date | null;
    vendorError: string;
  };
}) {
  const charged = lines.reduce((sum, line) => sum + line.chargedCents, 0);
  const floor = lines.reduce((sum, line) => sum + line.floorCents, 0);
  const landed = order.vendorCostCents + order.vendorShippingCents;
  const priced = order.vendorQuotedAt !== null;
  const belowFloor = priced && charged < floor;

  return (
    <Card
      title="Trade printer"
      description="Post cards and hangers are bought in and drop-shipped. Signs are cut here and never appear on this card."
      actions={
        configured ? null : <Badge tone="warn">Dry run — no credentials</Badge>
      }
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Nothing on this order is trade printed.</p>
      ) : (
        <>
          <ul className="divide-y divide-line text-sm">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap justify-between gap-3 py-2 first:pt-0">
                <span className="min-w-0">{line.description}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="text-muted">cost {formatCents(line.costCents)}</span>
                  <span className="mx-2 text-muted">·</span>
                  <span className="text-muted">floor {formatCents(line.floorCents)}</span>
                  <span className="mx-2 text-muted">·</span>
                  <span
                    className={
                      line.chargedCents < line.floorCents
                        ? "font-semibold text-accent-ink"
                        : "font-semibold"
                    }
                  >
                    charged {formatCents(line.chargedCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {priced ? (
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Their goods</dt>
                <dd className="tabular-nums">{formatCents(order.vendorCostCents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  Their freight
                  {order.vendorShipMethod ? (
                    <span className="ml-1 text-xs">
                      ({order.vendorShipCarrier} {order.vendorShipMethod})
                    </span>
                  ) : null}
                </dt>
                <dd className="tabular-nums">{formatCents(order.vendorShippingCents)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Landed cost</dt>
                <dd className="tabular-nums">{formatCents(landed)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Charged for these lines</dt>
                <dd className="tabular-nums">{formatCents(charged)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-extrabold">
                <dt>Margin</dt>
                <dd className={`tabular-nums ${charged - landed < 0 ? "text-accent-ink" : ""}`}>
                  {formatCents(charged - landed)}
                </dd>
              </div>
              <p className="pt-1 text-xs text-muted">
                Quoted {formatDateTime(order.vendorQuotedAt)}. The floor is their cost doubled plus
                our file-prep charge; freight is on top of it and is not in the floor, because what
                the candidate pays for delivery is set separately.
              </p>
            </dl>
          ) : null}

          {belowFloor ? (
            <div className="mt-3">
              <Note tone="warn">
                These lines were sold for less than trade cost doubled plus prep. Either the
                catalogue price needs raising in <code>src/lib/shop/catalog.ts</code>, or take the
                difference off knowingly.
              </Note>
            </div>
          ) : null}

          {order.vendorError ? (
            <div className="mt-3">
              <Note tone="bad">{order.vendorError}</Note>
            </div>
          ) : null}

          {shippingOptions.length > 0 && !order.vendorSentAt ? (
            <form action={chooseVendorShipping} className="mt-4 space-y-2 border-t border-line pt-3">
              <input type="hidden" name="orderId" value={orderId} />
              <Field label="Shipping service" hint="Cheapest is taken by default.">
                <select
                  name="service"
                  className="field"
                  defaultValue={`${order.vendorShipCarrier}|${order.vendorShipMethod}|${order.vendorShippingCents}`}
                >
                  {shippingOptions.map((option) => (
                    <option
                      key={`${option.carrier}|${option.method}`}
                      value={`${option.carrier}|${option.method}|${option.priceCents}`}
                    >
                      {option.carrier} {option.method} — {formatCents(option.priceCents)}
                      {option.days ? ` · ${option.days} days` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className="btn-secondary">
                Use this service
              </button>
            </form>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <form action={priceWithVendor}>
              <input type="hidden" name="orderId" value={orderId} />
              <button type="submit" className="btn-secondary">
                {priced ? "Re-price with SinaLite" : "Price with SinaLite"}
              </button>
            </form>

            {order.vendorSentAt ? (
              <p className="self-center text-sm text-muted">
                Sent {formatDateTime(order.vendorSentAt)} — their reference{" "}
                <span className="font-semibold">{order.vendorOrderId}</span>
                {order.vendorStatus ? `, ${order.vendorStatus}` : ""}.
              </p>
            ) : (
              <form action={sendToVendor}>
                <input type="hidden" name="orderId" value={orderId} />
                <button type="submit" className="btn-primary">
                  Send to SinaLite
                </button>
              </form>
            )}
          </div>

          {order.vendorSentAt ? (
            <form action={saveVendorTracking} className="mt-3 space-y-2 border-t border-line pt-3">
              <input type="hidden" name="orderId" value={orderId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Tracking number"
                  hint="From their dispatch email — their API has no status to poll."
                >
                  <input name="tracking" defaultValue={order.vendorTracking} className="field" />
                </Field>
                <Field label="Their status">
                  <input name="vendorStatus" defaultValue={order.vendorStatus} className="field" />
                </Field>
              </div>
              <button type="submit" className="btn-secondary">
                Save
              </button>
            </form>
          ) : null}
        </>
      )}
    </Card>
  );
}
