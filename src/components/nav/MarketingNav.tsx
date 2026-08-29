"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui";
import { MobileStrip, NavLink, Shell } from "./shared";

/**
 * The nav for the pages that are still arguing.
 *
 * Two destinations and one action, because a marketing page has exactly one job
 * here: get someone into the workspace. The previous "Get early access" is gone
 * — there is a running product behind this link, and asking people to queue for
 * something they can open is worse than not asking.
 */
const LINKS = [
  { href: "/maintainers", label: "For maintainers" },
  { href: "/marketplace/energy", label: "The data" },
];

export function MarketingNav({ pathname }: { pathname: string }) {
  return (
    <Shell strip={<MobileStrip links={[...LINKS, { href: "/workspace", label: "Workspace" }]} />}>
      <Link href="/" className="mr-5 flex items-center gap-2.5">
        <Wordmark />
      </Link>

      {LINKS.map((l) => (
        <NavLink key={l.href} {...l} active={pathname.startsWith(l.href)} />
      ))}

      <div className="ml-auto flex items-center gap-2.5">
        <ThemeToggle />
        <ButtonLink href="/workspace" tone="primary" size="sm">
          Open my workspace
        </ButtonLink>
      </div>
    </Shell>
  );
}
