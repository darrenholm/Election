import type { Metadata, Viewport } from "next";
import { SideNav } from "@/components/nav";
import { OutboxStatus } from "@/components/outbox-status";
import { getActiveCampaign } from "@/lib/campaign";
import { OFFICES, label } from "@/lib/enums";
import { getAccessibleCampaigns, getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campaign Manager",
  description: "Field, volunteer, finance and sign management for a municipal campaign",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Campaign", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Canvassers use this one-handed in daylight; let them pinch-zoom.
  maximumScale: 5,
  themeColor: "#2f4fa8",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, active, accessible] = await Promise.all([
    getCurrentUser(),
    getActiveCampaign(),
    getAccessibleCampaigns(),
  ]);

  return (
    <html lang="en">
      <body>
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
          />
          <div className="min-w-0 flex-1">
            <OutboxStatus />
            {user?.mustChangePassword ? (
              <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
      </body>
    </html>
  );
}
