import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * The shell both halves of this deployment share, and nothing more.
 *
 * Two quite different things are served from one app: the campaign manager
 * under (app), behind the sign-in gate, and the election print portal under
 * (portal), which is open to any candidate who lands on holmgraphics.ca. They
 * want different chrome — a sidebar of campaign sections versus a storefront
 * header — so each route group brings its own layout and this one holds only
 * <html>, <body> and the stylesheet.
 */

export const metadata: Metadata = {
  title: "Holm Graphics",
  description: "Campaign management and election print for municipal candidates",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Canvassers use this one-handed in daylight; let them pinch-zoom.
  maximumScale: 5,
  themeColor: "#2f4fa8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
