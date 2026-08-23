"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CampaignSwitcher, type SwitcherCampaign } from "./campaign-switcher";

type Item = { href: string; label: string; icon: string };

const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/voters", label: "Voters", icon: "☰" },
  { href: "/canvass", label: "Canvassing", icon: "⚑" },
  { href: "/meet", label: "Met someone", icon: "✦" },
  { href: "/map", label: "Map", icon: "◈" },
  { href: "/streets", label: "Streets", icon: "⌸" },
  { href: "/volunteers", label: "Volunteers", icon: "♣" },
  { href: "/shifts", label: "Shifts", icon: "◷" },
  { href: "/finance", label: "Finance", icon: "$" },
  { href: "/signs", label: "Lawn signs", icon: "▤" },
  { href: "/texting", label: "Texting", icon: "✉" },
  { href: "/social", label: "Facebook", icon: "◐" },
  { href: "/events", label: "Events", icon: "★" },
  { href: "/campaigns", label: "Campaigns", icon: "◫" },
  { href: "/municipalities", label: "Municipalities", icon: "⌂" },
  { href: "/team", label: "Team", icon: "☗" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({
  active,
  campaigns,
  user,
}: {
  active: SwitcherCampaign | null;
  campaigns: SwitcherCampaign[];
  user: { name: string; email: string; isAdmin: boolean } | null;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav className="no-print hidden w-56 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <CampaignSwitcher active={active} campaigns={campaigns} />
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {ITEMS.filter((item) => item.href !== "/team" || user?.isAdmin).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(pathname, item.href)
                      // A red marker on the live page: the one place in the nav
                      // the eye should land without hunting.
                      ? "bg-brand-soft font-semibold text-brand-ink before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-accent before:content-['']"
                      : "text-muted hover:bg-raise hover:text-ink"
                  }`}
                >
                  <span aria-hidden className="w-4 text-center text-base leading-none">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
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
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                isActive(pathname, item.href)
                  ? "bg-brand text-white"
                  : "bg-raise text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
