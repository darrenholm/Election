"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The storefront's header.
 *
 * A client component only so the current section can be marked — the campaign
 * manager's sidebar does the same thing, with the same red marker, so the two
 * halves of the deployment feel like one shop.
 */
const LINKS = [
  { href: "/election", label: "Catalogue", exact: true },
  { href: "/election/orders", label: "My orders" },
  { href: "/election/account", label: "Account" },
];

export function PortalNav({
  customer,
  cartCount,
}: {
  customer: { name: string } | null;
  cartCount: number;
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
        <Link href="/election" className="mr-auto flex items-baseline gap-2">
          <span className="text-base font-extrabold tracking-[-0.02em]">Holm Graphics</span>
          <span className="border-l border-line pl-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Election print
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition-colors ${
                isActive(link.href, link.exact)
                  ? "bg-brand-soft font-semibold text-brand-ink"
                  : "text-muted hover:bg-raise hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/election/cart"
            className={`ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium ${
              isActive("/election/cart")
                ? "bg-brand-soft text-brand-ink"
                : "text-muted hover:bg-raise hover:text-ink"
            }`}
          >
            <span aria-hidden>▢</span>
            Cart
            {cartCount > 0 ? (
              <span className="rounded-full bg-accent px-1.5 text-[0.7rem] font-bold text-white tabular-nums">
                {cartCount}
              </span>
            ) : null}
          </Link>

          {customer ? null : (
            <Link href="/election/sign-in" className="btn-secondary ml-2 !py-1.5 text-sm">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
