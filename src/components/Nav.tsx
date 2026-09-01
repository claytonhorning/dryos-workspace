"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AppNav } from "./nav/AppNav";
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
const MARKETING = ["/", "/maintainers"];

export function Nav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const marketing = MARKETING.some((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r)));

  /*
    Any page inside a workspace gets the workspace chrome, whether you are
    reading it or changing it. Editing is a mode of being in a workspace, not a
    trip out of one — the tabs are how you move between pages either way, and
    swapping the whole bar underneath someone the moment they press Edit is a
    disorientation with nothing to show for it.

    The workspace's own list page keeps the app's navigation: there is no page
    open, so there is nothing for tabs to switch between.
  */
  const inside = pathname.match(/^\/workspace\/([^/]+)\/([^/]+)/);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      {marketing ? (
        <MarketingNav pathname={pathname} />
      ) : inside ? (
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
  );
}
