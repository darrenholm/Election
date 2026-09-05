"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CampaignSwitcher, type SwitcherCampaign } from "./campaign-switcher";

type Item = { href: string; label: string; icon: string; external?: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/voters", label: "Voters", icon: "☰" },
  { href: "/canvass", label: "Canvassing", icon: "⚑" },
  { href: "/meet", label: "Met someone", icon: "✦" },
  { href: "/map", label: "Map", icon: "◈" },
  { href: "/streets", label: "Streets", icon: "⌸" },
  { href: "/insights", label: "What doors say", icon: "◎" },
  { href: "/volunteers", label: "Volunteers", icon: "♣" },
  { href: "/shifts", label: "Shifts", icon: "◷" },
  { href: "/finance", label: "Finance", icon: "$" },
  { href: "/signs", label: "Lawn signs", icon: "▤" },
  { href: "/texting", label: "Texting", icon: "✉" },
  { href: "/social", label: "Facebook", icon: "◐" },
  { href: "/events", label: "Events", icon: "★" },
  { href: "/shop", label: "Print queue", icon: "▦" },
  { href: "/campaigns", label: "Campaigns", icon: "◫" },
  { href: "/municipalities", label: "Municipalities", icon: "⌂" },
  { href: "/team", label: "Team", icon: "☗" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

/**
 * Sections that belong to the consultant running the operation rather than to a
 * campaign. The print queue holds every candidate's orders — including those of
 * people running against each other — so it sits behind the same bar as Team.
 */
const ADMIN_ONLY = new Set(["/team", "/shop"]);

/**
 * The way across to the storefront, sat next to Lawn signs because that is
 * where somebody is standing when they realise they need more of something.
 *
 * Its href is handed in rather than living in ITEMS, because with a campaign in
 * scope it carries a signed handoff token naming that campaign — so it is
 * minted per render on the server, and differs for every candidate.
 */
function itemsWithOrdering(orderHref: string): Item[] {
  const after = ITEMS.findIndex((item) => item.href === "/signs") + 1;
  const promo: Item = {
    href: orderHref,
    label: "Order promo items",
    icon: "◇",
    external: true,
  };
  return [...ITEMS.slice(0, after), promo, ...ITEMS.slice(after)];
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({
  active,
  campaigns,
  user,
  counts = {},
  orderHref,
}: {
  active: SwitcherCampaign | null;
  campaigns: SwitcherCampaign[];
  user: { name: string; email: string; isAdmin: boolean } | null;
  /** Anything waiting, by href. A print order nobody has looked at is the one
   *  thing in this app that costs money to miss. */
  counts?: Record<string, number>;
  /** Where "Order promo items" points. Built on the server; see nav item above. */
  orderHref: string;
}) {
  const pathname = usePathname();
  const items = itemsWithOrdering(orderHref).filter(
    (item) => !ADMIN_ONLY.has(item.href) || user?.isAdmin,
  );

  return (
    <>
      {/* Desktop rail */}
      <nav className="no-print hidden w-56 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <CampaignSwitcher active={active} campaigns={campaigns} />
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {items.map((item) => {
              // An external item leaves the app, so it never highlights as the
              // current page, and it cannot be a <Link>: next/link is for
              // routes this app owns, and the shop may be on another domain.
              const className = `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                !item.external && isActive(pathname, item.href)
                  // A red marker on the live page: the one place in the nav
                  // the eye should land without hunting.
                  ? "bg-brand-soft font-semibold text-brand-ink before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-accent before:content-['']"
                  : "text-muted hover:bg-raise hover:text-ink"
              }`;
              const content = (
                <>
                  <span aria-hidden className="w-4 text-center text-base leading-none">
                    {item.icon}
                  </span>
                  {item.label}
                  {counts[item.href] ? (
                    <span className="ml-auto rounded-full bg-accent px-1.5 text-[0.7rem] font-bold tabular-nums text-white">
                      {counts[item.href]}
                    </span>
                  ) : null}
                </>
              );

              return (
                <li key={item.href}>
                  {item.external ? (
                    <a href={item.href} className={className}>
                      {content}
                    </a>
                  ) : (
                    <Link href={item.href} className={className}>
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {user ? (
            <div className="border-t border-line px-4 py-3">
              <p className="truncate text-xs font-medium">{user.name || user.email}</p>
              <p className="truncate text-[0.7rem] text-muted">
                {user.isAdmin ? "Administrator" : "Campaign account"}
              </p>
              <Link
                href="/account/password"
                className="mt-1 inline-block text-[0.7rem] text-muted underline hover:text-ink"
              >
                Change password
              </Link>
            </div>
          ) : null}
        </div>
      </nav>

      {/* Mobile bar — horizontally scrollable so canvassers can reach every
          section one-handed without a hamburger menu. */}
      <nav className="no-print sticky top-0 z-20 border-b border-line bg-surface md:hidden">
        <CampaignSwitcher active={active} campaigns={campaigns} />
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
          {items.map((item) => {
            const className = `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
              !item.external && isActive(pathname, item.href)
                ? "bg-brand text-white"
                : "bg-raise text-muted"
            }`;
            const content = (
              <>
                {item.label}
                {counts[item.href] ? (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[0.7rem] font-bold tabular-nums text-white">
                    {counts[item.href]}
                  </span>
                ) : null}
              </>
            );

            return item.external ? (
              <a key={item.href} href={item.href} className={className}>
                {content}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
