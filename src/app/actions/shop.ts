"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bool, date, int, oneOf, str } from "@/lib/form";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/password";
import { OFFICES } from "@/lib/enums";
import { getCurrentCustomer, requireCustomer, requireOwnOrder } from "@/lib/shop/auth";
import {
  SHOP_SESSION_COOKIE,
  SHOP_SESSION_COOKIE_OPTIONS,
  createShopSessionToken,
} from "@/lib/shop/session";
import { productBySlug, variantByKey } from "@/lib/shop/catalog";
import {
  garmentStyle,
  priceGarmentChoice,
  toGarmentChoice,
} from "@/lib/shop/garments";
import { describeNesting, priceDecals } from "@/lib/shop/decals";
import {
  priceLine,
  readSizeRun,
  describeSizeRun,
  snapQuantity,
  type ChosenOptions,
} from "@/lib/shop/pricing";
import {
  allocateOrderNumber,
  artworkProblem,
  draftOrderId,
  recalcOrder,
  repriceItem,
} from "@/lib/shop/orders";

/**
 * Everything a candidate can do on the print portal.
 *
 * Server actions are public endpoints, so the rule from the campaign manager
 * next door applies here too: an id is not a permission. Every action that is
 * handed an order or an item resolves who owns it and re-checks that against
 * the session, in requireOwnOrder() — hiding a button is not access control.
 */

/** Only relative destinations, so ?next= cannot bounce somebody off-site. */
function safeNext(value: FormDataEntryValue | null, fallback = "/election"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

async function startCustomerSession(customerId: string) {
  const jar = await cookies();
  jar.set(SHOP_SESSION_COOKIE, createShopSessionToken(customerId), SHOP_SESSION_COOKIE_OPTIONS);
  await db.shopCustomer.update({
    where: { id: customerId },
    data: { lastSignInAt: new Date() },
  });
}

/* ------------------------------------------------------------- the account */

export async function registerCustomer(_prev: string | null, formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return "Enter an email address the shop can reach you at.";

  const weak = checkPasswordStrength(password);
  if (weak) return weak;

  const taken = await db.shopCustomer.findUnique({ where: { email }, select: { id: true } });
  if (taken) return "There is already an account on that address. Sign in instead.";

  const customer = await db.shopCustomer.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      contactName: str(formData, "contactName"),
      phone: str(formData, "phone"),
      candidateName: str(formData, "candidateName"),
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
      municipality: str(formData, "municipality"),
      ward: str(formData, "ward"),
    },
    select: { id: true },
  });

  await startCustomerSession(customer.id);
  redirect(safeNext(formData.get("next")));
}

export async function signInCustomer(_prev: string | null, formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  const customer = await db.shopCustomer.findUnique({ where: { email } });

  // One message for every failure. Naming which half was wrong tells somebody
  // guessing which addresses are worth guessing passwords for.
  const failure = "That email and password do not match an account.";
  if (!customer || !customer.isActive) {
    // Spend roughly the time a real check would, so the response does not
    // reveal whether the account exists.
    await verifyPassword(password, "00:00");
    return failure;
  }
  if (!(await verifyPassword(password, customer.passwordHash))) return failure;

  await startCustomerSession(customer.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOutCustomer() {
  const jar = await cookies();
  jar.delete(SHOP_SESSION_COOKIE);
  redirect("/election");
}

export async function updateCustomerProfile(_prev: string | null, formData: FormData) {
  const customer = await requireCustomer();

  await db.shopCustomer.update({
    where: { id: customer.id },
    data: {
      contactName: str(formData, "contactName"),
      phone: str(formData, "phone"),
      candidateName: str(formData, "candidateName"),
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
      municipality: str(formData, "municipality"),
      ward: str(formData, "ward"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      postalCode: str(formData, "postalCode"),
    },
  });

  revalidatePath("/election/account");
  return "Saved.";
}

export async function changeCustomerPassword(_prev: string | null, formData: FormData) {
  const customer = await requireCustomer();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const row = await db.shopCustomer.findUnique({ where: { id: customer.id } });
  if (!row) redirect("/election/sign-in");

  if (!(await verifyPassword(current, row.passwordHash))) return "Your current password is not right.";
  if (next !== confirm) return "The new passwords do not match.";

  const weak = checkPasswordStrength(next);
  if (weak) return weak;

  await db.shopCustomer.update({
    where: { id: customer.id },
    data: { passwordHash: await hashPassword(next) },
  });
  return "Password changed.";
}

/* ---------------------------------------------------------------- the cart */

/**
 * Add a configured product to the cart.
 *
 * Nothing about the price comes off the form. The slug, the cut and the chosen
 * options are read, resolved against the catalogue, and priced here — a posted
 * unit price would be a posted discount.
 */
export async function addToCart(formData: FormData) {
  const customer = await requireCustomer();

  const product = productBySlug(str(formData, "productSlug"));
  if (!product) redirect("/election");

  // Hiding the button is not the rule; this is. A product still being set up
  // has no settled price, and an order taken against one is a promise the shop
  // has not agreed to.
  if (product.pricingProvisional) redirect(`/election/products/${product.slug}`);

  const variant = variantByKey(product, str(formData, "variantKey")) ?? product.variants[0];

  const chosen: ChosenOptions = {};
  if (product.sheetPricing) {
    chosen[product.sheetPricing.key] = str(formData, `opt_${product.sheetPricing.key}`);
  }
  for (const group of product.options) {
    chosen[group.key] = str(formData, `opt_${group.key}`);
  }

  /* ----------------------------------------------------------------- decals */
  // A decal is whatever size was asked for, so the price is worked out from the
  // dimensions rather than looked up. Recomputed here from the posted
  // measurements: the page showed a figure using the same function, and this is
  // the one that is charged.
  if (product.customSize) {
    const chosen: ChosenOptions = {};
    let unitSurcharge = 0;
    let flatSurcharge = 0;
    for (const group of product.options) {
      if (group.onlyForVariants && !group.onlyForVariants.includes(variant.key)) continue;
      const picked =
        group.choices.find((c) => c.value === str(formData, `opt_${group.key}`)) ?? group.choices[0];
      chosen[group.key] = picked.value;
      unitSurcharge += picked.unitSurchargeCents ?? 0;
      flatSurcharge += picked.flatSurchargeCents ?? 0;
    }

    const widthInches = Number(str(formData, "decalWidth"));
    // A square or a circle is one measurement; the form sends the same number
    // twice rather than letting the two disagree.
    const heightInches = Number(str(formData, "decalHeight"));
    const wanted = int(formData, "quantity", 1);

    const decal = priceDecals({ widthInches, heightInches, quantity: wanted });
    if (!decal) redirect(`/election/products/${product.slug}?problem=size`);

    const shape = chosen.shape ?? "RECTANGLE";
    const size =
      shape === "ROUND"
        ? `${widthInches}" round`
        : shape === "SQUARE"
          ? `${widthInches}" square`
          : `${widthInches}" × ${heightInches}"`;

    const orderId = await draftOrderId(customer.id);
    await db.shopOrderItem.create({
      data: {
        orderId,
        productSlug: product.slug,
        productName: product.name,
        variantKey: variant.key,
        variantName: size,
        options: { ...chosen, decalWidth: String(widthInches), decalHeight: String(heightInches) },
        optionsSummary: [
          size,
          describeNesting(decal.nesting),
          ...product.options.map(
            (g) => (g.choices.find((c) => c.value === chosen[g.key]) ?? g.choices[0]).label,
          ),
        ]
          .filter(Boolean)
          .join(" · "),
        quantity: wanted,
        unitPriceCents: Math.round((decal.totalCents + unitSurcharge * wanted) / wanted),
        setupFeeCents: flatSurcharge,
        lineTotalCents: decal.totalCents + unitSurcharge * wanted + flatSurcharge,
        artworkNote: str(formData, "artworkNote"),
      },
    });

    await recalcOrder(orderId);
    revalidatePath("/election", "layout");
    redirect("/election/cart");
  }

  /* ---------------------------------------------------------------- apparel */
  // A garment's price comes from what SanMar charge for that style, in that
  // colour, in that size — never from the catalogue and never from the form.
  // The page computed a total with the same function; this is the one that
  // counts.
  if (variant.garmentStyleCode) {
    const style = await garmentStyle(variant.garmentStyleCode);
    if (!style) redirect(`/election/products/${product.slug}`);

    const choice = toGarmentChoice(style);
    const colourName =
      choice.colours.find((c) => c.name === str(formData, "garmentColour"))?.name ??
      choice.colours[0]?.name ??
      "";

    // Only sizes this colour actually comes in, so a hand-made post cannot
    // order a 4XL of something that stops at 2XL.
    const run: Record<string, number> = {};
    const colourSizes = choice.colours.find((c) => c.name === colourName)?.sizes ?? [];
    for (const sku of colourSizes) {
      const count = int(formData, `size_${sku.size}`, 0);
      if (count > 0) run[sku.size] = count;
    }

    let unitSurcharge = 0;
    const chosenDecoration: ChosenOptions = {};
    for (const group of product.options) {
      if (group.onlyForVariants && !group.onlyForVariants.includes(variant.key)) continue;
      const picked =
        group.choices.find((c) => c.value === str(formData, `opt_${group.key}`)) ?? group.choices[0];
      chosenDecoration[group.key] = picked.value;
      unitSurcharge += picked.unitSurchargeCents ?? 0;
    }

    const garmentPriced = priceGarmentChoice(choice, colourName, run, unitSurcharge);
    if (!garmentPriced) redirect(`/election/products/${product.slug}?problem=sizes`);

    const orderId = await draftOrderId(customer.id);
    await db.shopOrderItem.create({
      data: {
        orderId,
        productSlug: product.slug,
        productName: product.name,
        variantKey: variant.key,
        variantName: `${variant.name} · ${colourName}`,
        options: { ...chosenDecoration, garmentColour: colourName },
        optionsSummary: [
          colourName,
          describeSizeRun(run),
          ...product.options
            .filter((g) => !g.onlyForVariants || g.onlyForVariants.includes(variant.key))
            .map(
              (g) =>
                (g.choices.find((c) => c.value === chosenDecoration[g.key]) ?? g.choices[0]).label,
            ),
        ]
          .filter(Boolean)
          .join(" · "),
        sizeBreakdown: run,
        quantity: garmentPriced.quantity,
        // Per garment on average: the sizes are priced individually and the
        // line total is what they add up to, so this is for display only.
        unitPriceCents: Math.round(garmentPriced.goodsCents / garmentPriced.quantity),
        setupFeeCents: garmentPriced.setupCents,
        lineTotalCents: garmentPriced.totalCents,
        artworkNote: str(formData, "artworkNote"),
      },
    });

    await recalcOrder(orderId);
    revalidatePath("/election", "layout");
    redirect("/election/cart");
  }

  // Apparel is ordered as a run of sizes; the total of the run is the quantity.
  let sizeBreakdown: Record<string, number> | null = null;
  let quantity: number;
  if (product.sizes) {
    const counts: Record<string, unknown> = {};
    for (const size of product.sizes) counts[size] = str(formData, `size_${size}`);
    const run = readSizeRun(product, counts);
    if (run.quantity === 0) redirect(`/election/products/${product.slug}?problem=sizes`);
    sizeBreakdown = run.sizes;
    quantity = run.quantity;
  } else {
    quantity = int(formData, "quantity", variant.minQuantity);
  }

  // On a trade-printed product this drops to a run the printer actually does.
  quantity = snapQuantity(product, variant, quantity);

  const priced = priceLine(product, variant, quantity, chosen);
  const summary = sizeBreakdown
    ? [priced.optionsSummary, describeSizeRun(sizeBreakdown)].filter(Boolean).join(" · ")
    : priced.optionsSummary;

  const orderId = await draftOrderId(customer.id);

  await db.shopOrderItem.create({
    data: {
      orderId,
      productSlug: product.slug,
      productName: product.name,
      variantKey: variant.key,
      variantName: variant.name,
      options: priced.options,
      optionsSummary: summary,
      sizeBreakdown: sizeBreakdown ?? undefined,
      quantity: priced.quantity,
      unitPriceCents: priced.unitPriceCents,
      setupFeeCents: priced.setupFeeCents,
      lineTotalCents: priced.lineTotalCents,
      artworkNote: str(formData, "artworkNote"),
    },
  });

  await recalcOrder(orderId);
  revalidatePath("/election", "layout");
  redirect("/election/cart");
}

/** Both cart edits resolve the item's order before touching it. */
async function ownedItem(itemId: string) {
  const customer = await requireCustomer();
  const item = await db.shopOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true, order: { select: { customerId: true, status: true } } },
  });
  // A submitted order is no longer the customer's to edit — by then the shop
  // may already have ordered stock against it.
  if (!item || item.order.customerId !== customer.id || item.order.status !== "DRAFT") {
    redirect("/election/cart");
  }
  return item;
}

export async function updateCartItem(formData: FormData) {
  const item = await ownedItem(str(formData, "itemId"));
  await repriceItem(item.id, int(formData, "quantity", 1));
  await recalcOrder(item.orderId);
  revalidatePath("/election/cart");
}

export async function removeCartItem(formData: FormData) {
  const item = await ownedItem(str(formData, "itemId"));
  await db.shopOrderItem.delete({ where: { id: item.id } });
  await recalcOrder(item.orderId);
  revalidatePath("/election", "layout");
}

/** Ticking the design service changes the order total, so it re-adds it up. */
export async function setDesignService(formData: FormData) {
  const customer = await requireCustomer();
  const orderId = await draftOrderId(customer.id);

  await db.shopOrder.update({
    where: { id: orderId },
    data: { needsDesign: bool(formData, "needsDesign") },
  });
  await recalcOrder(orderId);
  revalidatePath("/election/cart");
  revalidatePath("/election/checkout");
}

/* ------------------------------------------------------------ the checkout */

export async function submitOrder(_prev: string | null, formData: FormData) {
  const customer = await requireCustomer();
  const orderId = await draftOrderId(customer.id);

  const order = await db.shopOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, _count: { select: { items: true } } },
  });
  if (!order || order.status !== "DRAFT") redirect("/election/orders");
  if (order._count.items === 0) return "There is nothing in your cart yet.";

  const contactName = str(formData, "contactName");
  const phone = str(formData, "phone");
  const candidateName = str(formData, "candidateName");
  const municipality = str(formData, "municipality");

  if (contactName === "") return "The shop needs a name to put on the job.";
  if (phone === "") return "A phone number, please — proofs get sorted out by phone.";
  if (candidateName === "") return "Whose name goes on the signs?";
  if (municipality === "") return "Which municipality are you running in?";

  const needsDesign = bool(formData, "needsDesign");
  const fulfilment = oneOf(formData, "fulfilment", ["PICKUP", "DELIVERY"] as const, "PICKUP");

  // The account is updated alongside the order, so the next order arrives with
  // the details already filled in.
  await db.shopCustomer.update({
    where: { id: customer.id },
    data: {
      contactName,
      phone,
      candidateName,
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
      municipality,
      ward: str(formData, "ward"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      postalCode: str(formData, "postalCode"),
    },
  });

  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      needsDesign,
      designBrief: needsDesign ? str(formData, "designBrief") : "",
      authorisationLine: str(formData, "authorisationLine"),
      contactName,
      email: customer.email,
      phone,
      candidateName,
      office: oneOf(formData, "office", OFFICES, "COUNCILLOR"),
      municipality,
      ward: str(formData, "ward"),
      addressLine: str(formData, "addressLine"),
      city: str(formData, "city"),
      postalCode: str(formData, "postalCode"),
      fulfilment,
      neededBy: date(formData, "neededBy"),
      notes: str(formData, "notes"),
    },
  });

  // Totals are re-added up after the design service is set, not before.
  await recalcOrder(orderId);

  await db.shopOrder.update({
    where: { id: orderId },
    data: {
      number: await allocateOrderNumber(),
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  revalidatePath("/election", "layout");
  redirect(`/election/orders/${orderId}?placed=1`);
}

/* --------------------------------------------------------------- artwork -- */

export async function uploadArtwork(_prev: string | null, formData: FormData) {
  const orderId = str(formData, "orderId");
  const { order } = await requireOwnOrder(orderId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a file first.";

  const problem = artworkProblem(file);
  if (problem) return problem;

  await db.shopArtwork.create({
    data: {
      orderId: order.id,
      filename: file.name.slice(0, 200) || "artwork",
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
      byteSize: file.size,
      note: str(formData, "note"),
    },
  });

  revalidatePath(`/election/orders/${order.id}`);
  revalidatePath("/election/checkout");
  return `${file.name} received.`;
}

export async function deleteArtwork(formData: FormData) {
  const customer = await requireCustomer();
  const artwork = await db.shopArtwork.findUnique({
    where: { id: str(formData, "artworkId") },
    select: { id: true, orderId: true, order: { select: { customerId: true, status: true } } },
  });
  // Once the job is in production the file is what is being printed; removing
  // it from under the press helps nobody.
  if (
    !artwork ||
    artwork.order.customerId !== customer.id ||
    !["DRAFT", "SUBMITTED", "QUOTED"].includes(artwork.order.status)
  ) {
    redirect("/election/orders");
  }

  await db.shopArtwork.delete({ where: { id: artwork.id } });
  revalidatePath(`/election/orders/${artwork.orderId}`);
  revalidatePath("/election/checkout");
}

/* --------------------------------------------------------------- reorder -- */

/**
 * Copy a past order's lines into the cart.
 *
 * Re-priced against today's catalogue rather than copied at the old price: the
 * old order keeps what it was quoted, and the new one is quoted now. Campaigns
 * reorder signs constantly in the last fortnight, and this is the difference
 * between that taking a minute and taking a phone call.
 */
export async function reorder(formData: FormData) {
  const { customer, order } = await requireOwnOrder(str(formData, "orderId"));

  const items = await db.shopOrderItem.findMany({ where: { orderId: order.id } });
  const cartId = await draftOrderId(customer.id);

  for (const item of items) {
    const product = productBySlug(item.productSlug);
    const variant = product ? variantByKey(product, item.variantKey) : null;
    if (!product || !variant) continue;

    const priced = priceLine(
      product,
      variant,
      snapQuantity(product, variant, item.quantity),
      (item.options ?? {}) as ChosenOptions,
    );

    await db.shopOrderItem.create({
      data: {
        orderId: cartId,
        productSlug: item.productSlug,
        productName: item.productName,
        variantKey: item.variantKey,
        variantName: item.variantName,
        options: priced.options,
        optionsSummary: item.optionsSummary,
        sizeBreakdown: item.sizeBreakdown ?? undefined,
        quantity: priced.quantity,
        unitPriceCents: priced.unitPriceCents,
        setupFeeCents: priced.setupFeeCents,
        lineTotalCents: priced.lineTotalCents,
        artworkNote: item.artworkNote,
      },
    });
  }

  await recalcOrder(cartId);
  revalidatePath("/election", "layout");
  redirect("/election/cart");
}

/** Used by the portal header to show what is in the cart. */
export async function currentCustomer() {
  return getCurrentCustomer();
}
