/**
 * Who the portal says it is, and where the money goes.
 *
 * Payment is by Interac e-transfer, so the address below is not a formality —
 * it is the whole payment system, printed on the confirmation page and on every
 * order. It is read from the environment so a deployment can change it without
 * a code change, with the shop's own address as the fallback.
 */

export const SHOP_NAME = process.env.SHOP_NAME || "Holm Graphics";

export const ETRANSFER_EMAIL = process.env.SHOP_ETRANSFER_EMAIL || "darren@holmgraphics.ca";

/** Left blank rather than invented — the portal simply omits what is not set. */
export const SHOP_PHONE = process.env.SHOP_PHONE || "";
export const SHOP_PICKUP_ADDRESS = process.env.SHOP_PICKUP_ADDRESS || "";
