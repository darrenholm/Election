"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/app/actions/shop";
import { formatCents } from "@/lib/money";
import type { Product } from "@/lib/shop/catalog";
import {
  applicableBreak,
  describeSizeRun,
  nextBreak,
  nextSheetDiscount,
  priceLine,
  readSizeRun,
  sheetDiscountPercent,
  type ChosenOptions,
} from "@/lib/shop/pricing";

/**
 * Configure a product and see what it costs, as you change it.
 *
 * The price is worked out on the page by the same priceLine() the server uses
 * when the line is actually added, so the figure on the button is the figure on
 * the order. Nothing about the price is posted — the form sends the choices and
 * the server prices them again.
 */
export function Configurator({ product, signedIn }: { product: Product; signedIn: boolean }) {
  const [variantKey, setVariantKey] = useState(product.variants[0].key);
  const variant = product.variants.find((v) => v.key === variantKey) ?? product.variants[0];

  const [options, setOptions] = useState<ChosenOptions>(() => {
    const initial: ChosenOptions = {};
    if (product.sheetPricing) initial[product.sheetPricing.key] = product.sheetPricing.choices[0].value;
    for (const group of product.options) initial[group.key] = group.choices[0].value;
    return initial;
  });

  const [quantity, setQuantity] = useState(variant.minQuantity);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  // Sheet-priced products are ordered in sheets, not in signs: the sheet is
  // what the shop buys and cuts, and a number of signs that is not a whole
  // number of sheets cannot be made.
  const [sheets, setSheets] = useState(1);

  const perSheet = variant.signsPerSheet ?? 0;

  const sizeRun = useMemo(
    () => (product.sizes ? readSizeRun(product, sizes) : null),
    [product, sizes],
  );

  const effectiveQuantity = sizeRun ? sizeRun.quantity : perSheet > 0 ? sheets * perSheet : quantity;
  const priced = useMemo(
    () => priceLine(product, variant, Math.max(effectiveQuantity, 1), options),
    [product, variant, effectiveQuantity, options],
  );

  const belowMinimum = perSheet === 0 && effectiveQuantity < variant.minQuantity;
  const upsell = variant.signsPerSheet
    ? nextSheetDiscount(variant, effectiveQuantity)
    : nextBreak(variant, effectiveQuantity);

  function choose(key: string, value: string) {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  function chooseVariant(key: string) {
    setVariantKey(key);
    const next = product.variants.find((v) => v.key === key);
    // A sheet count carries across cuts untouched — three sheets is three
    // sheets. A typed quantity only ever moves up to the new cut's minimum,
    // never silently down: a campaign that typed 200 means 200.
    if (next && !next.signsPerSheet && quantity < next.minQuantity) setQuantity(next.minQuantity);
  }

  return (
    <form action={addToCart} className="space-y-6">
      <input type="hidden" name="productSlug" value={product.slug} />
      <input type="hidden" name="variantKey" value={variant.key} />
      {Object.entries(options).map(([key, value]) => (
        <input key={key} type="hidden" name={`opt_${key}`} value={value} />
      ))}

      {/* ------------------------------------------------------------- size */}
      <fieldset>
        <legend className="field-label">
          {product.sizes ? "Garment" : product.sheetPricing ? "Cut" : "Size"}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {product.variants.map((v) => (
            <label
              key={v.key}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${
                v.key === variant.key
                  ? "border-brand bg-brand-soft/50"
                  : "border-line bg-surface hover:bg-raise"
              }`}
            >
              <input
                type="radio"
                name="variantPicker"
                checked={v.key === variant.key}
                onChange={() => chooseVariant(v.key)}
                className="mt-0.5 size-4 accent-[var(--color-brand)]"
              />
              <span className="min-w-0">
                <span className="block font-semibold">{v.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{v.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ------------------------------------------------ sheet, then options */}
      {product.sheetPricing ? (
        <fieldset>
          <legend className="field-label">{product.sheetPricing.label}</legend>
          {product.sheetPricing.hint ? (
            <p className="mb-2 text-xs text-muted">{product.sheetPricing.hint}</p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {product.sheetPricing.choices.map((choice) => (
              <label
                key={choice.value}
                className={`flex cursor-pointer items-baseline gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  options[product.sheetPricing!.key] === choice.value
                    ? "border-brand bg-brand-soft/50"
                    : "border-line bg-surface hover:bg-raise"
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <input
                    type="radio"
                    checked={options[product.sheetPricing!.key] === choice.value}
                    onChange={() => choose(product.sheetPricing!.key, choice.value)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  <span className="font-semibold">{choice.label}</span>
                </span>
                {/* No per-sheet figure here: what a candidate wants to know is
                    what their signs come to, and the price below says that as
                    soon as a size and a quantity are picked. */}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.options
        .filter((g) => !g.onlyForVariants || g.onlyForVariants.includes(variant.key))
        .map((group) => (
          <fieldset key={group.key}>
            <legend className="field-label">{group.label}</legend>
            {group.hint ? <p className="mb-2 text-xs text-muted">{group.hint}</p> : null}
            <select
              value={options[group.key] ?? group.choices[0].value}
              onChange={(e) => choose(group.key, e.target.value)}
              className="field"
            >
              {group.choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </fieldset>
        ))}

      {/* --------------------------------------------------------- quantity */}
      {product.sizes ? (
        <fieldset>
          <legend className="field-label">Size run</legend>
          <p className="mb-2 text-xs text-muted">
            How many of each. What you enter is what gets printed — the total is the quantity.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {product.sizes.map((size) => (
              <label key={size} className="block">
                <span className="mb-1 block text-center text-xs font-bold">{size}</span>
                <input
                  type="number"
                  min={0}
                  name={`size_${size}`}
                  value={sizes[size] ?? ""}
                  placeholder="0"
                  onChange={(e) => setSizes((prev) => ({ ...prev, [size]: e.target.value }))}
                  className="field text-center tabular-nums"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            {sizeRun && sizeRun.quantity > 0
              ? `${sizeRun.quantity} garments — ${describeSizeRun(sizeRun.sizes)}`
              : "Nothing entered yet."}
          </p>
        </fieldset>
      ) : (
        <fieldset>
          <legend className="field-label">How many</legend>
          {perSheet > 0 ? (
            // Lots, in signs. A candidate is buying signs and should never have
            // to work out how many a sheet yields — the lot size is in the name
            // of the cut, and every number offered here is a whole lot.
            <>
              <input type="hidden" name="quantity" value={effectiveQuantity} />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSheets(n)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums transition-colors ${
                      sheets === n
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-line bg-surface text-muted hover:bg-raise"
                    }`}
                  >
                    {n * perSheet}
                    {sheetDiscountPercent(n) > 0 ? (
                      <span className="ml-1.5 font-bold text-accent-ink">
                        −{sheetDiscountPercent(n)}%
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Signs of this size come in lots of {perSheet}. Want more than{" "}
                {10 * perSheet}? Put it in the box below and we will sort it out.
              </p>
            </>
          ) : product.quantitiesFixed ? (
            // These are printed in fixed runs, so the runs are the choice. A
            // box to type in would take orders nobody can fill.
            <select
              name="quantity"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="field w-full sm:w-64 tabular-nums"
            >
              {variant.breaks.map((b) => (
                <option key={b.quantity} value={b.quantity}>
                  {b.quantity.toLocaleString("en-CA")} — {formatCents(b.unitPriceCents)} each
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                name="quantity"
                min={variant.minQuantity}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="field w-32 tabular-nums"
              />
              <span className="text-xs text-muted">Minimum {variant.minQuantity}</span>
            </div>
          )}

          {variant.breaks.length > 1 && !product.quantitiesFixed ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {variant.breaks.map((b) => (
                <button
                  key={b.quantity}
                  type="button"
                  onClick={() => setQuantity(b.quantity)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
                    applicableBreak(variant, quantity).quantity === b.quantity
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line bg-surface text-muted hover:bg-raise"
                  }`}
                >
                  {b.quantity} · {formatCents(b.unitPriceCents)} ea
                </button>
              ))}
            </div>
          ) : null}
        </fieldset>
      )}

      {/* --------------------------------------------------------- the price */}
      <div className="rounded-xl border border-line bg-raise/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted">
            {effectiveQuantity} × {formatCents(priced.unitPriceCents)}
            {priced.setupFeeCents > 0 ? ` + ${formatCents(priced.setupFeeCents)} setup` : ""}
          </span>
          <span className="text-2xl font-extrabold tabular-nums tracking-tight">
            {formatCents(priced.lineTotalCents)}
          </span>
        </div>

        {priced.sheetsUsed > 0 ? (
          <p className="mt-2 text-xs text-muted">
            {priced.sheetsUsed} {priced.sheetsUsed === 1 ? "lot" : "lots"} of {perSheet}
            {priced.discountPercent > 0 ? (
              <span className="font-semibold text-brand-ink">
                {" "}
                — {priced.discountPercent}% off for the extra{" "}
                {priced.sheetsUsed === 2 ? "lot" : "lots"}
              </span>
            ) : null}
          </p>
        ) : null}

        {upsell ? (
          <p className="mt-1 text-xs text-accent-ink">
            {"moreSigns" in upsell
              ? `Another ${upsell.moreSigns} takes ${upsell.percent}% off the whole order.`
              : `${upsell.more} more brings each one down to ${formatCents(upsell.unitPriceCents)}.`}
          </p>
        ) : null}

        {belowMinimum ? (
          <p className="mt-1 text-xs font-medium text-accent-ink">
            The minimum for this one is {variant.minQuantity}; that is what will be ordered.
          </p>
        ) : null}

        <p className="mt-2 text-xs text-muted">
          Before HST.{" "}
          {product.pickupOnly
            ? "Collected from the shop — signs travel badly by courier."
            : "Delivery, if you want it, is quoted with the order."}
        </p>
      </div>

      <label className="block">
        <span className="field-label">Anything we should know</span>
        <textarea
          name="artworkNote"
          rows={2}
          placeholder="Colours, what it has to say, whether you have artwork already…"
          className="field"
        />
      </label>

      {signedIn ? (
        <button type="submit" className="btn-primary w-full sm:w-auto">
          Add to cart — {formatCents(priced.lineTotalCents)}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/election/sign-in?next=${encodeURIComponent(`/election/products/${product.slug}`)}`}
            className="btn-primary"
          >
            Sign in to order
          </Link>
          <span className="text-xs text-muted">
            No account?{" "}
            <Link href="/election/register" className="underline hover:text-ink">
              Takes a minute
            </Link>
            .
          </span>
        </div>
      )}
    </form>
  );
}
