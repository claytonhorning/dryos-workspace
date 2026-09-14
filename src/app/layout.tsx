import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import Script from "next/script";
import { AppFrame } from "@/components/AppFrame";
import { Nav } from "@/components/Nav";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { SITE } from "@/lib/apiDocs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The wordmark's face, and only the wordmark's — self-hosted by next/font so it
// is not a render-blocking request to a third party for five characters.
const sora = Sora({
  variable: "--font-mark",
  subsets: ["latin"],
  weight: "800",
  display: "swap",
});

const GA_ID = "G-EGBSDY4DE3";

const DESCRIPTION =
  "Live, reconciled US power market data — ERCOT, MISO, PJM, SPP, CAISO, NYISO and ISO-NE prices, load, generation and forecasts, plus weather and building permits — in dashboards, a public API, and an MCP server for AI agents.";

export const metadata: Metadata = {
  // Every relative URL below — canonicals, Open Graph images — resolves
  // against the real domain, never whichever host served the build.
  metadataBase: new URL(SITE),
  title: {
    default: "Dryos — live US power market data for dashboards, APIs and AI agents",
    template: "%s — Dryos",
  },
  description: DESCRIPTION,
  applicationName: "Dryos",
  keywords: [
    "power market data",
    "electricity prices",
    "LMP",
    "ERCOT",
    "MISO",
    "PJM",
    "SPP",
    "CAISO",
    "NYISO",
    "ISO-NE",
    "MCP server",
    "energy data API",
  ],
  // No canonical and no og:url here: both are inherited by every page that
  // does not set its own, and a canonical of "/" on /maintainers tells a
  // search engine the page is a duplicate of the home page. Each page names
  // its own address.
  openGraph: {
    type: "website",
    siteName: "Dryos",
    title: "Dryos — live US power market data",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Dryos — live US power market data", description: DESCRIPTION },
  /*
    Declared here rather than by the `app/icon.*` file convention, because the
    generated package is a set that has to agree with itself: the webmanifest
    names its two PNGs at absolute root paths, so those live in `public/` — and
    once one of them does, all of them should, rather than half the set carrying
    a build hash in its URL and half not.

    The SVG is first because that is what a modern browser should take: it is
    the only one that stays sharp at any size. The mark is four tiles, one
    lit — a screen with a tile just updated — three pearl tiles (a pale
    diagonal gradient with a white rim, so they catch the eye on a dark strip
    and hold their edge on a light one) and one chartreuse in the same
    finish, on no ground, in every theme. The ICO and the 96px PNG (Safari ignores SVG
    favicons) are the same; the touch and manifest icons put it on the ink
    ground because iOS fills transparency with black and a maskable icon must
    be full bleed. The API serves the same tiles muted (`status_page.ICON`):
    the solid tiles are the site, the quiet ones the API. Redraw the set
    together.
  */
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Resolves the theme before first paint so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} antialiased`}
      >
        {/*
          The nav reads the query string to tell a launched page from one being
          edited, which needs a boundary for prerendering. The fallback is the
          bar's own height, so nothing below it moves when the real one arrives.
        */}
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <Nav />
        </Suspense>
        <AppFrame>{children}</AppFrame>
        {/* Google Analytics — after hydration, so it never delays the page. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}
