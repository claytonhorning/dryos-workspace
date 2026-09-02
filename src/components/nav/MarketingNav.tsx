"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui";
import { MobileStrip, NavLink, Shell } from "./shared";

/**
 * The nav for the pages that are still arguing.
 *
 * The landing page is one long argument in sections, so the links are anchors
 * into it, and they carry the leading slash so they work from the maintainers
 * page too. One action, because a marketing page has exactly one job here: get
 * someone into the workspace. The previous "Get early access" is gone; there is
 * a running product behind this link, and asking people to queue for something
 * they can open is worse than not asking. "The data" went when the catalogue
 * pages did: the data is browsed inside the workspace now.
 */
const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#the-data", label: "The data" },
  { href: "/#the-bill", label: "The bill" },
  { href: "/#workspaces", label: "Workspaces" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#about", label: "Who we are" },
  { href: "/maintainers", label: "For maintainers" },
];

/* Anchors are never "active": the bar has no idea which section is in view,
   and a highlight that is wrong is worse than none. */
const isActive = (href: string, pathname: string) =>
  !href.startsWith("/#") && pathname.startsWith(href);

export function MarketingNav({ pathname }: { pathname: string }) {
  return (
    <Shell strip={<MobileStrip links={[...LINKS, { href: "/workspace", label: "Workspace" }]} />}>
      <Link href="/" className="mr-5 flex items-center gap-2.5">
        <Wordmark />
      </Link>

      {LINKS.map((l) => (
        <NavLink key={l.href} {...l} active={isActive(l.href, pathname)} />
      ))}

      <div className="ml-auto flex items-center gap-2.5">
        <ThemeToggle />
        <ButtonLink href="/workspace" tone="primary" size="sm">
          Open Dryos
        </ButtonLink>
      </div>
    </Shell>
  );
}
