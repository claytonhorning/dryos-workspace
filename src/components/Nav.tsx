"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import { shellFor } from "@/lib/shell";
import { AppNav } from "./nav/AppNav";
import { AppSidebar } from "./nav/AppSidebar";
import { CommunityNav } from "./nav/CommunityNav";
import { MarketingNav } from "./nav/MarketingNav";
import { SpaceNav } from "./nav/SpaceNav";

/**
 * Three shells, chosen by route.
 *
 * The landing page and the maintainer pitch are still selling something; every
 * other route is the product, where a visitor has already arrived and a call to
 * action is just noise in the chrome. Splitting them means neither has to
 * compromise: the marketing nav can push toward the workspace, and the app nav
 * can spend its right-hand side on what you are spending instead.
 */
/*
  Which shell is `shellFor`'s decision (lib/shell.ts), shared with the page
  frame so the body steps right by exactly the sidebar the nav drew. The
  reasoning — the door is still outside, a page inside a workspace keeps the
  workspace chrome whether read or edited — lives with the rule.
*/

export function Nav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const shell = shellFor(pathname);
  const inside = pathname.match(/^\/workspace\/([^/]+)\/([^/]+)/);

  if (shell === "none") return null;

  return (
    <>
      {/* The product's left edge, fixed, on the routes with no page open. */}
      {shell === "app" && <AppSidebar pathname={pathname} />}
      <header
        className={cx(
          "sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md",
          shell === "app" && "md:pl-[var(--sidebar-w)]",
        )}
      >
        {shell === "marketing" ? (
          <MarketingNav pathname={pathname} />
        ) : shell === "community" ? (
          <CommunityNav pathname={pathname} />
        ) : shell === "space" && inside ? (
          <SpaceNav
            spaceId={inside[1]}
            pageId={inside[2]}
            editMode={search.get("edit") === "1"}
            naming={search.get("name") === "1"}
          />
        ) : (
          <AppNav pathname={pathname} />
        )}
      </header>
    </>
  );
}
