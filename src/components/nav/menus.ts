import { GITHUB_REPO, MCP_URL, PUBLIC_API } from "@/lib/apiDocs";
import { GROUPS, groupHref, liveStreams, streamsIn } from "@/lib/dataPages";
import type { Menu } from "./MegaMenu";

/**
 * What is behind each dropdown.
 *
 * The data menu is built from the catalogue rather than written out, so an
 * operator added there appears in the bar with the right count and never a
 * stale one. The other two are hand-written, because they are about what you
 * can do rather than about what exists.
 */
export function menus(): Menu[] {
  const streams = liveStreams().length;
  const energy = GROUPS.filter((g) => g.id !== "weather" && g.id !== "permits");
  const rest = GROUPS.filter((g) => g.id === "weather" || g.id === "permits");

  return [
    {
      label: "Data",
      lead: {
        title: `${streams} live streams`,
        body: "Prices, load, generation, forecasts and constraints from seven US grid operators — plus weather and building permits. Free to read, no key.",
        href: "/data",
        cta: "Browse the catalogue",
      },
      groups: [
        {
          heading: "Grid operators",
          dense: true,
          items: energy.map((g) => ({
            label: g.label,
            href: groupHref(g),
            tag: String(streamsIn(g).length),
          })),
        },
        {
          heading: "Beside the markets",
          items: rest.map((g) => ({
            label: g.label,
            href: groupHref(g),
            body: g.id === "weather" ? "Observations and forecasts" : "Austin, San Antonio, DFW",
          })),
        },
      ],
    },
    {
      label: "Workspaces",
      lead: {
        title: "Build a screen, not a script",
        body: "Charts, maps, tickers and tables on live data, arranged on a grid and wired to each other. No code, and nothing to deploy.",
        href: "/workspace",
        cta: "Build one free",
      },
      groups: [
        {
          heading: "Build",
          items: [
            {
              label: "Your workspaces",
              href: "/workspace",
              body: "Pages of tiles, versioned by what you asked for",
            },
            {
              label: "Community workspaces",
              href: "/workspace",
              body: "One per operator, ready to copy",
            },
          ],
        },
        {
          heading: "Run it yourself",
          items: [
            {
              label: "Open source",
              href: `https://github.com/${GITHUB_REPO}`,
              body: "The whole workspace, MIT licensed",
              external: true,
            },
            {
              label: "On your own data",
              href: `https://github.com/${GITHUB_REPO}#where-the-data-comes-from`,
              body: "Point it at your streams as well as ours",
              external: true,
            },
          ],
        },
      ],
    },
    {
      label: "Developers",
      lead: {
        title: "Every stream, one GET away",
        body: "Read-only JSON with no key and no sign-up. Relative times stay relative, so a URL keeps working.",
        href: "/docs",
        cta: "Read the API reference",
      },
      groups: [
        {
          heading: "Interfaces",
          items: [
            { label: "REST API", href: "/docs", body: PUBLIC_API.replace("https://", "") },
            { label: "MCP server", href: "/mcp", body: "Claude, ChatGPT, Cursor, VS Code" },
            {
              label: "MCP endpoint",
              href: MCP_URL,
              body: "Paste into any client",
              external: true,
            },
          ],
        },
        {
          heading: "For agents",
          items: [
            { label: "/llms.txt", href: "/llms.txt", body: "The rules, as plain text" },
            {
              label: "GitHub",
              href: `https://github.com/${GITHUB_REPO}`,
              body: "The workspace, open source",
              external: true,
            },
            { label: "For maintainers", href: "/maintainers", body: "Publish a stream, get paid" },
          ],
        },
      ],
    },
  ];
}
