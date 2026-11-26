import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${BRAND.product} — trade Solana tokens wallet-to-wallet`,
  description: BRAND.pitch,
  openGraph: { title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.pitch, images: ["/banner.jpg"] },
  twitter: { card: "summary_large_image", site: `@${BRAND.x}` },
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 py-10 text-xs text-muted">
            {BRAND.product} · non-custodial OTC on Solana · 0% platform fees · <a className="hover:text-lime" href={`https://x.com/${BRAND.x}`}>@{BRAND.x}</a> · <a className="hover:text-lime" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
