import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { liveReadiness } from "@/lib/orders/live";

export const metadata: Metadata = {
  title: "BrickLoop - custom brick kits",
  description: "Design a custom brick model, see exactly what it costs, and get it delivered with building instructions.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const live = (await liveReadiness()).ready;
  return (
    <html lang="en">
      <body>
        {!live && (
          <div className="sim-banner" role="status">
            SIMULATION MODE: quotes, payments, purchases and shipments are simulated. No money moves and nothing ships.
          </div>
        )}
        <header className="topbar">
          <Link className="logo" href="/">
            <span className="logo-mark" aria-hidden /> BrickLoop
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/">Models</Link>
            <Link href="/designs">My designs</Link>
            <Link href="/orders">My orders</Link>
            <Link href="/about">How it works</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          BrickLoop pilot. Original designs only. Purchases are made by adults; we do not collect information about children. LEGO&reg; is a trademark of the LEGO Group, which
          does not sponsor or endorse this site.
        </footer>
      </body>
    </html>
  );
}
