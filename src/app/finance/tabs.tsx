"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/contributions", label: "Contributions" },
  { href: "/finance/expenses", label: "Expenses" },
  { href: "/finance/form4", label: "Form 4 worksheet" },
];

export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((tab) => {
        const active =
          tab.href === "/finance"
            ? pathname === "/finance"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand text-brand-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
