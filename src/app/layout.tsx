import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dryos — buy data from the experts who maintain it",
  description:
    "Governed energy data, operated by the person who knows the source. Starting with CAISO and ERCOT day-ahead prices on one schema.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Resolves the theme before first paint so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Nav />
        <main className="dr-page-bg min-h-[calc(100vh-3.5rem)]">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-6 py-6 text-[12.5px] text-faint sm:flex-row sm:items-center sm:justify-between">
            <span>
              Dryos · pre-launch. Both collectors are in development and are not
              serving data yet.
            </span>
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase">v0.1</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
