"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: "◉" },
  { href: "/voters", label: "Voters", icon: "☰" },
  { href: "/canvass", label: "Canvassing", icon: "⚑" },
  { href: "/map", label: "Map", icon: "◈" },
  { href: "/streets", label: "Streets", icon: "⌸" },
  { href: "/volunteers", label: "Volunteers", icon: "♣" },
  { href: "/shifts", label: "Shifts", icon: "◷" },
  { href: "/finance", label: "Finance", icon: "$" },
  { href: "/signs", label: "Lawn signs", icon: "▤" },
  { href: "/texting", label: "Texting", icon: "✉" },
  { href: "/events", label: "Events", icon: "★" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ campaignName }: { campaignName: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav className="no-print hidden w-56 shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="border-b border-line px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Campaign
            </p>
            <p className="mt-0.5 truncate text-sm font-bold">
              {campaignName || "Unnamed campaign"}
            </p>
          </div>
          <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(pathname, item.href)
                      ? "bg-brand-soft text-brand-ink"
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
        </div>
      </nav>

      {/* Mobile bar — horizontally scrollable so canvassers can reach every
          section one-handed without a hamburger menu. */}
      <nav className="no-print sticky top-0 z-20 border-b border-line bg-surface md:hidden">
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
