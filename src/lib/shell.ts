/**
 * Which chrome a route gets. The nav and the page frame both need the answer
 * — one to draw the sidebar, the other to make room for it — and two copies
 * of the rule would drift.
 */
export type Shell = "marketing" | "space" | "app" | "none";

/** Still selling something: the landing page, the maintainer pitch, and the
    MCP server's page, which is read mostly by people who have no account. */
const MARKETING = ["/", "/maintainers", "/mcp"];

/**
 * The door is still outside. A signed-out visitor who pressed "Open Dryos"
 * lands on /login, and the product's own chrome there — a sidebar, the
 * usage chip, a clock — is the room they have not entered. They keep the
 * bar they came from; the callback route the email link lands on is the
 * same threshold.
 */
const DOOR = ["/login", "/auth", "/oauth"];

export function shellFor(pathname: string): Shell {
  // The deck is a room with the lights down: no bar, no links out.
  if (pathname.startsWith("/deck")) return "none";
  if (
    MARKETING.some((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r))) ||
    DOOR.some((r) => pathname.startsWith(r))
  )
    return "marketing";
  // Any page inside a workspace, read or edited, gets the workspace chrome.
  // The workspace's own list page does not: nothing is open there.
  if (/^\/workspace\/[^/]+\/[^/]+/.test(pathname)) return "space";
  return "app";
}
