import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import { AppFrame } from "@/components/AppFrame";
import { Nav } from "@/components/Nav";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
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

export const metadata: Metadata = {
  title: "Dryos — build on data from the people who maintain it",
  description:
    "Industry dashboards running on production data, changed by talking to an agent and shared with your team. You pay for the queries you make. Starting with ERCOT real-time locational marginal prices.",
  /*
    Declared here rather than by the `app/icon.*` file convention, because the
    generated package is a set that has to agree with itself: the webmanifest
    names its two PNGs at absolute root paths, so those live in `public/` — and
    once one of them does, all of them should, rather than half the set carrying
    a build hash in its URL and half not.

    The SVG is first because that is what a modern browser should take: it is
    the only one that stays sharp at any size, and it carries its own dark
    ground so the cream letterform reads on a light tab strip too.
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
      </body>
    </html>
  );
}
