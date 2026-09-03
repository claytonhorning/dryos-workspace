"use client";

import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { shellFor } from "@/lib/shell";

/**
 * The page body, stepped right by the sidebar's width on the routes that
 * have one. The sidebar is fixed, so nothing else knows it is there; this
 * is the one place that does.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const app = shellFor(usePathname()) === "app";
  return (
    <main
      className={cx(
        "dr-page-bg min-h-[calc(100vh-var(--nav-h))]",
        app && "md:pl-[var(--sidebar-w)]",
      )}
    >
      {children}
    </main>
  );
}
