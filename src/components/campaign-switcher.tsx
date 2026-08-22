"use client";

import { useState } from "react";
import Link from "next/link";
import { setActiveCampaign } from "@/app/actions/campaigns";

export type SwitcherCampaign = {
  id: string;
  candidateName: string;
  officeLabel: string;
  municipality: string;
};

/**
 * Which candidate you are working on, and how to change it.
 *
 * Deliberately prominent: with six campaigns sharing one app, entering a
 * contribution against the wrong candidate is a compliance problem, not a
 * cosmetic one.
 */
export function CampaignSwitcher({
  active,
  campaigns,
}: {
  active: SwitcherCampaign | null;
  campaigns: SwitcherCampaign[];
}) {
  const [open, setOpen] = useState(false);

  if (!active) {
    return (
      <Link
        href="/campaigns"
        className="block border-b border-line px-4 py-3 text-sm font-medium text-brand-ink"
      >
        Set up your first campaign →
      </Link>
    );
  }

  const others = campaigns.filter((c) => c.id !== active.id);

  return (
    <div className="relative border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-raise"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
            Working on
          </span>
          <span className="block truncate text-sm font-bold">{active.candidateName}</span>
          <span className="block truncate text-xs text-muted">
            {active.officeLabel} · {active.municipality}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-40 border-b border-line bg-surface shadow-lg">
          <ul className="max-h-80 overflow-y-auto py-1">
            {others.length === 0 ? (
              <li className="px-4 py-2 text-xs text-muted">No other active campaigns.</li>
            ) : (
              others.map((campaign) => {
                const switchTo = setActiveCampaign.bind(null, campaign.id);
                return (
                  <li key={campaign.id}>
                    <form action={switchTo}>
                      <button
                        type="submit"
                        className="w-full px-4 py-2 text-left text-sm hover:bg-raise"
                      >
                        <span className="block font-medium">{campaign.candidateName}</span>
                        <span className="block text-xs text-muted">
                          {campaign.officeLabel} · {campaign.municipality}
                        </span>
                      </button>
                    </form>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            href="/campaigns"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2 text-xs font-medium text-brand-ink hover:bg-raise"
          >
            Manage all campaigns →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
