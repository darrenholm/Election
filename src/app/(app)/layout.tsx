import type { Metadata } from "next";
import { SideNav } from "@/components/nav";
import { OutboxStatus } from "@/components/outbox-status";
import { getActiveCampaign } from "@/lib/campaign";
import { OFFICES, label } from "@/lib/enums";
import { getAccessibleCampaigns, getCurrentUser } from "@/lib/auth";
import { portalHomeUrl, portalOrderUrl } from "@/lib/shop/handoff";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Campaign Manager",
  description: "Field, volunteer, finance and sign management for a municipal campaign",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Campaign", statusBarStyle: "default" },
};

export default async function CampaignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, active, accessible] = await Promise.all([
    getCurrentUser(),
    getActiveCampaign(),
    getAccessibleCampaigns(),
  ]);

  // Print orders arrive from the public portal and nothing emails anybody, so
  // the count of ones nobody has quoted yet is carried in the nav where it will
  // be seen from whatever page the shop happens to be on.
  const waitingOrders = user?.isAdmin
    ? await db.shopOrder.count({ where: { status: "SUBMITTED" } })
    : 0;

  // With a campaign selected the link carries a signed handoff so the shop
  // fills the candidate's details in; without one there is nothing to hand
  // over, so it goes to the storefront's front page.
  const orderHref = active ? portalOrderUrl(active.id, "/election") : portalHomeUrl();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <SideNav
        active={
          active
            ? {
                id: active.id,
                candidateName: active.candidateName || "Unnamed candidate",
                officeLabel: label(OFFICES, active.office),
                municipality: active.municipality.name,
              }
            : null
        }
        campaigns={accessible.map((c) => ({
          id: c.id,
          candidateName: c.candidateName || "Unnamed candidate",
          officeLabel: label(OFFICES, c.office),
          municipality: c.municipalityName,
        }))}
        user={user}
        counts={{ "/shop": waitingOrders }}
        orderHref={orderHref}
      />
      <div className="min-w-0 flex-1">
        <OutboxStatus />
        {user?.mustChangePassword ? (
          <div className="no-print bg-accent-soft px-4 py-1.5 text-center text-xs font-medium text-accent-ink">
            You are using a temporary password.{" "}
            <a href="/account/password" className="underline">
              Choose your own
            </a>
            .
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
