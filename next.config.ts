import type { NextConfig } from "next";

/**
 * Where the election storefront went.
 *
 * It used to be served from this app at /election. It is a Holm Graphics shop
 * now — candidates are Holm Graphics customers, several already were, and their
 * orders belong on the same jobs board as everything else the shop makes. This
 * app is the campaign manager and nothing else.
 *
 * A permanent redirect rather than a deletion, because the old address is on
 * cards, in emails and in browser histories, and a candidate who follows one
 * should land on the order form rather than a 404.
 *
 * ELECTION_SHOP_URL overrides the target if the storefront ever moves again.
 */
const SHOP = (
  process.env.ELECTION_SHOP_URL || "https://shop.holmgraphics.ca/shop/election"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Everything under the old portal, including deep links to a product or
      // an order, goes to the one page that replaced it. There is nothing to
      // map path-for-path: the new form is a single page.
      { source: "/election", destination: SHOP, permanent: true },
      { source: "/election/:path*", destination: SHOP, permanent: true },
    ];
  },
};

export default nextConfig;
