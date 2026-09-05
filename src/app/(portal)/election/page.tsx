import Link from "next/link";
import {
  PRODUCTS,
  startingRunPrice,
  startingUnitPriceCents,
  type Product,
} from "@/lib/shop/catalog";
import { DECAL_MINIMUM_CENTS } from "@/lib/shop/decals";
import { formatCents } from "@/lib/money";
import { ETRANSFER_EMAIL } from "@/lib/shop/config";

export const metadata = {
  title: "Election print for municipal candidates — Holm Graphics",
  description:
    "Order lawn signs, post cards, door hangers, t-shirts, hoodies and decals for a municipal election campaign.",
};

/**
 * The front of the portal.
 *
 * Written for somebody who has just decided to run and has never bought print
 * before: what the pieces are called, what they are for, roughly what they
 * cost, and what happens after they press the button.
 */
export default function PortalHome() {
  return (
    <div className="space-y-14">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-ink">
          Municipal election 2026
        </p>
        <h1 className="mt-3 max-w-2xl text-[2.4rem] font-extrabold leading-[1.1] tracking-[-0.03em]">
          Everything your campaign has to print, in one order.
        </h1>
        <span className="mt-4 block h-[3px] w-12 rounded-full bg-accent" />
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Signs for lawns and roadsides, cards for the mail, hangers for the doors
          nobody answers, and shirts for the people knocking on them. Price a run
          of signs yourself below — every size is a clean cut from a 4&prime; ×
          8&prime; sheet, and the sheet is what you pay for.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Signs and decals are made here and collected from the shop. Cards and
          door hangers are printed for us and{" "}
          <span className="font-semibold text-ink">the price includes getting them here</span> —
          no shipping added at the end.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#catalogue" className="btn-primary">
            See the catalogue
          </a>
          <Link href="/election/register" className="btn-secondary">
            Create an account
          </Link>
        </div>
      </section>

      <section id="catalogue" className="scroll-mt-20">
        <h2 className="text-lg font-bold tracking-tight">What we print for campaigns</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <Link
              key={product.slug}
              href={`/election/products/${product.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-sm transition-colors before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-brand/45 before:content-[''] hover:border-brand/50 hover:bg-raise"
            >
              <span aria-hidden className="text-2xl leading-none text-brand">
                {product.icon}
              </span>
              <h3 className="mt-3 text-base font-bold tracking-tight">{product.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{product.tagline}</p>
              <CardPrice product={product} />
              <p className="mt-1 text-xs text-muted">
                Ready in about {product.leadTimeDays} working days
                {product.shippingIncluded ? " · shipping included" : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight">How an order goes</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "1",
              title: "Price it and send it",
              body: "Configure what you need, add it to the cart and submit. Nothing is charged at this point and nothing is printed.",
            },
            {
              step: "2",
              title: "We quote it back",
              body: "We confirm the price and set a proof going, usually the same working day. Your order page shows the total.",
            },
            {
              step: "3",
              title: "You pay",
              body: `Interac e-transfer to ${ETRANSFER_EMAIL} with your order number in the message, or a cheque or debit at the counter when you collect. Pay from the campaign account, not your own.`,
            },
            {
              step: "4",
              title: "We print, you collect",
              body: "You approve the proof and we print. Everything is picked up at the shop, and there is no shipping charge on top. Your receipt is on the order page for the filing.",
            },
          ].map((s) => (
            <li key={s.step} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">
                {s.step}
              </span>
              <p className="mt-3 text-sm font-bold">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-raise/60 p-5">
          <h2 className="text-sm font-bold tracking-tight">Two things to check with your clerk</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
            <li>
              <span className="font-medium text-ink">When signs may go up, and where.</span> Sign
              by-laws are municipal and they differ — how many days before voting day, how far back
              from the pavement, and what is allowed on a road allowance. A sign on a provincial
              highway right-of-way is the Ministry&rsquo;s rule, not the town&rsquo;s.
            </li>
            <li>
              <span className="font-medium text-ink">What has to appear on the piece.</span>{" "}
              Campaign advertising generally has to say who authorised it. Tell us the line you want
              and we will set it on everything.
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-raise/60 p-5">
          <h2 className="text-sm font-bold tracking-tight">This is a campaign expense</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Everything here counts against your spending limit and belongs on your financial
            statement. Every order gets a printable receipt showing the supplier, the date, what was
            bought and the tax — which is what the filing wants, and what an auditor asks for when it
            is missing.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * The "from $x" on a catalogue card.
 *
 * Three shapes, because the products are bought three different ways: by the
 * run (cards, hangers), by the piece (signs, shirts), or quoted from the size
 * the candidate gives us (decals).
 */
function CardPrice({ product }: { product: Product }) {
  if (product.pricingProvisional) {
    // Nothing is quoted here that is not settled. These are priced on the
    // phone until the supplier's own figures are loaded.
    return <p className="mt-4 text-sm font-semibold text-brand-ink">Priced on request</p>;
  }

  if (product.customSize) {
    return (
      <p className="mt-4 text-sm font-semibold tabular-nums">
        from {formatCents(DECAL_MINIMUM_CENTS)}
        <span className="font-normal text-muted"> the run</span>
      </p>
    );
  }

  const run = startingRunPrice(product);
  if (run) {
    return (
      <p className="mt-4 text-sm font-semibold tabular-nums">
        from {formatCents(run.totalCents)}
        <span className="font-normal text-muted">
          {" "}
          for {run.quantity.toLocaleString("en-CA")}
        </span>
      </p>
    );
  }

  return (
    <p className="mt-4 text-sm font-semibold tabular-nums">
      from {formatCents(startingUnitPriceCents(product))}
      <span className="font-normal text-muted"> each</span>
    </p>
  );
}
