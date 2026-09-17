"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GitHubGlyph } from "@/components/Glyphs";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui";
import { GITHUB_REPO } from "@/lib/apiDocs";
import { MegaMenu } from "./MegaMenu";
import { menus } from "./menus";
import { MobileStrip, Shell } from "./shared";

/**
 * The nav for the pages that are still arguing.
 *
 * Three dropdowns rather than a row of flat links, because the flat row named
 * pages and said nothing about what is behind them — and what is behind them
 * is a catalogue of 134 streams, a workspace builder and two machine
 * interfaces. Each menu answers one question somebody actually arrives with:
 * what data is there, what can I build, how do I get at it from my own code.
 *
 * One action, because a marketing page has exactly one job here: get someone
 * into the workspace. Pricing went with the section it pointed at — nothing
 * is metered or charged yet, and a price list in front of a product that
 * cannot take money is a promise the checkout cannot keep.
 */

/*
  No flat links left beside the three panels. "Try it" pointed at the hero's
  own demo, which is the first thing on the page it would have scrolled to —
  a link to what you are already looking at.
*/
const REPO_URL = `https://github.com/${GITHUB_REPO}`;

/** Which dropdown, if any, the current page sits under. */
const MENU_ROUTES: Record<string, string[]> = {
  Data: ["/data"],
  Workspaces: ["/workspace"],
  Developers: ["/docs", "/mcp", "/maintainers"],
};

export function MarketingNav({ pathname }: { pathname: string }) {
  // Built from the catalogue, so a new operator appears here with the right
  // count; memoised because it walks every schema.
  const panels = useMemo(() => menus(), []);

  // On the sign-in page the action is the page: a button that leads to the
  // login from the login is a door painted on a wall.
  const atDoor = pathname.startsWith("/login") || pathname.startsWith("/auth");

  // Small screens have no room for panels, so they get the destinations
  // flattened into the scrolling strip instead.
  const strip = [
    { href: "/data", label: "Data" },
    { href: "/docs", label: "API" },
    { href: "/mcp", label: "MCP" },
    { href: "/maintainers", label: "Maintainers" },
    { href: REPO_URL, label: "GitHub" },
    ...(atDoor ? [] : [{ href: "/workspace", label: "Workspace" }]),
  ];

  return (
    <Shell strip={<MobileStrip links={strip} />}>
      <Link href="/" className="mr-5 flex items-center gap-2.5">
        <Wordmark />
      </Link>

      {panels.map((m) => (
        <MegaMenu
          key={m.label}
          menu={m}
          active={(MENU_ROUTES[m.label] ?? []).some((r) => pathname.startsWith(r))}
        />
      ))}

      <div className="ml-auto flex items-center gap-1.5">
        {/* The repo, as a mark rather than a word: it is recognised faster
            than it is read, and it costs the bar almost nothing. */}
        <a
          href={REPO_URL}
          rel="noopener"
          aria-label="Dryos workspace on GitHub"
          title="The workspace is open source"
          className="hidden h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:flex"
        >
          <GitHubGlyph size={16} />
        </a>
        <ThemeToggle />
        {!atDoor && (
          <ButtonLink href="/workspace" tone="primary" size="sm">
            Open Dryos
          </ButtonLink>
        )}
      </div>
    </Shell>
  );
}
