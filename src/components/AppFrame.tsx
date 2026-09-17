"use client";

import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { shellFor } from "@/lib/shell";

/**
 * The page body, stepped right by the sidebar's width on the routes that
 * have one. The sidebar is fixed, so nothing else knows it is there; this
 * is the one place that does.
 */
export function AppFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  /*
    Rendered in the server layout and handed down, because this component is
    a client one and cannot import a server component — only receive one.
    Shown on the public routes alone: a launched workspace page is a screen
    on a wall and carries no chrome, and the product's own routes have the
    sidebar for the same job.
  */
  footer?: React.ReactNode;
}) {
  const shell = shellFor(usePathname());
  const app = shell === "app";
  return (
    <main
      className={cx(
        "dr-page-bg min-h-[calc(100vh-var(--nav-h))]",
        app && "md:pl-[var(--sidebar-w)]",
      )}
    >
      {children}
      {shell === "marketing" && footer}
    </main>
  );
}
