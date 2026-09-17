import { SCHEMAS, domainOf, grainSeconds, type Schema } from "@/lib/workspace/catalog";

/** `ALL` in `lib/domain.tsx`, spelled out: that module is a client one and
    `/llms.txt` renders on the server. */
const ALL = "all";

/**
 * The public API, described once for two readers: the developers page draws
 * it, and `/llms.txt` prints it for an agent. Two copies would drift, and the
 * one that drifted would be the one an agent was reading.
 *
 * The routes are written from `backend/src/dryos/api/main.py` and
 * `events.py`; a parameter added there is added here or it does not exist to
 * anyone outside. The stream list is the catalogue, so it never needs writing.
 */

/** Always the public host, whatever this deployment's own backend is — the
    reader is somebody else's program. */
export const PUBLIC_API = "https://api.dryos.ai";

export interface Param {
  name: string;
  /** e.g. "string", "ISO-8601", "repeatable". */
  type: string;
  desc: string;
}

export interface Route {
  path: string;
  summary: string;
  detail?: string;
  params?: Param[];
  example: string;
}

export const ROUTES: Route[] = [
  {
    path: "/v1/datasets",
    summary: "The catalogue — every stream, its columns and how to read it.",
    detail:
      "Each dataset carries its slug, schema (column, type, description, nullable), primary key, " +
      "collection schedule, source, and `serving`: which column names the entity, which is the " +
      "headline measure, and its unit. Start here.",
    example: "/v1/datasets",
  },
  {
    path: "/v1/datasets/{slug}",
    summary: "One stream's catalogue entry, plus its last twenty collection runs.",
    example: "/v1/datasets/ercot-realtime-lmp",
  },
  {
    path: "/v1/datasets/{slug}/nodes",
    summary: "The entities in a stream — nodes, zones, stations, fuels — with coverage.",
    detail:
      "Names are verbatim, inner spaces included: look them up here rather than guessing. " +
      "`facets` counts the entities by type; `coverage` gives the table's earliest and latest interval.",
    params: [
      { name: "q", type: "string", desc: "Case-insensitive substring of the entity name." },
      { name: "node_type", type: "string", desc: "Only entities of one type (HUB, LOAD_ZONE, RESOURCE_NODE…)." },
      { name: "limit", type: "1–2000", desc: "Default 200." },
    ],
    example: "/v1/datasets/ercot-realtime-lmp/nodes?q=HB_&limit=10",
  },
  {
    path: "/v1/datasets/{slug}/query",
    summary: "Read rows — raw, or bucketed into a rollup.",
    detail:
      "Raw rows come newest first. With `interval` the rows are buckets instead, each carrying " +
      "`samples`, the number of readings it holds — an average of twelve and an average of one are " +
      "different claims.",
    params: [
      { name: "node", type: "string", desc: "The entity, whatever the stream calls it. Refused on system-level feeds." },
      { name: "start", type: "ISO-8601 · -24h", desc: "Inclusive lower bound on interval_start_utc — a timestamp, or relative to now (-30m, -24h, -7d), which keeps a URL right forever." },
      { name: "end", type: "ISO-8601 · -1h", desc: "Exclusive upper bound, same forms." },
      { name: "limit", type: "≤ 50000", desc: "Default 1000." },
      { name: "interval", type: "15m · 1h · 1d · all", desc: "Bucket size, 1m to 7d. Absent means raw rows." },
      { name: "agg", type: "avg · min · max · sum", desc: "How a bucket is reduced. Default avg." },
      { name: "by", type: "column · none", desc: "What a rollup splits by. Default the entity; none for one series." },
      { name: "where", type: "column=value", desc: "Text columns only. Repeat on one column for OR; across columns is AND." },
      { name: "search", type: "column:text", desc: "Case-insensitive substring of a text column." },
      { name: "newest", type: "bool", desc: "One reading per entity — every row at each entity's most recent interval. The current value at every node in one call. Not with interval." },
      { name: "vintages", type: "latest · all", desc: "Forecasts keep every publication. Default is the newest per interval." },
      { name: "located", type: "bool", desc: "Only rows the map can place (located price streams)." },
      { name: "stamp", type: "start · noon", desc: "Label a daily bucket at noon UTC so the date reads right in US zones." },
    ],
    example: "/v1/datasets/ercot-realtime-lmp/query?node=HB_NORTH&limit=12",
  },
  {
    path: "/v1/datasets/{slug}/values",
    summary: "Distinct values of one text column, most rows first.",
    detail: "Takes the same `where` and `search` as the query, so a value can say how many rows it would leave.",
    params: [
      { name: "column", type: "string", desc: "A text column from the schema (not the entity — use /nodes)." },
      { name: "limit", type: "1–500", desc: "Default 40." },
    ],
    example: "/v1/datasets/ercot-realtime-lmp/values?column=node_type",
  },
  {
    path: "/v1/datasets/{slug}/sample",
    summary: "One entity's headline series over recent hours — a worked example.",
    params: [
      { name: "node", type: "string", desc: "The entity. Default a representative one (a hub where there are hubs)." },
      { name: "hours", type: "1–168", desc: "Default 24." },
    ],
    example: "/v1/datasets/ercot-realtime-lmp/sample?node=HB_HOUSTON&hours=6",
  },
  {
    path: "/v1/datasets/{slug}/preview",
    summary: "Per interval: how many entities landed, and how late the source and Dryos each were.",
    params: [{ name: "hours", type: "1–168", desc: "Default 24." }],
    example: "/v1/datasets/ercot-realtime-lmp/preview?hours=2",
  },
  {
    path: "/v1/datasets/{slug}/runs",
    summary: "Collection history: every run, its outcome and rows written.",
    params: [{ name: "hours", type: "1–2880", desc: "Default 24." }],
    example: "/v1/datasets/ercot-realtime-lmp/runs?hours=1",
  },
  {
    path: "/v1/status",
    summary: "Every collector's health, freshness and changelog in one payload.",
    example: "/v1/status",
  },
  {
    path: "/v1/reference/node-locations/{iso}",
    summary: "Where an operator's pricing nodes are, and the evidence for each placement.",
    detail: "iso is ERCOT, MISO, PJM, SPP, CAISO, NYISO or ISO-NE.",
    example: "/v1/reference/node-locations/MISO",
  },
  {
    path: "/v1/events",
    summary: "Server-sent events: which dataset just landed rows, and when. No rows ride on it.",
    detail:
      "Each message is `{\"dataset\": slug, \"at\": ISO}`. A `ping` event every twenty seconds keeps it " +
      "honest; `resync` means refetch everything. Hear the name, then read through /query.",
    example: "/v1/events",
  },
  {
    path: "/health",
    summary: "Liveness.",
    example: "/health",
  },
];

/** Live, collected streams in one domain — or every one for the blend. */
export function apiStreams(domain?: string | null): Schema[] {
  return SCHEMAS.filter(
    (s) =>
      s.dataset &&
      s.availability === "live" &&
      (!domain || domain === ALL || domainOf(s) === domain),
  );
}

export function every(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${seconds / 60}m`;
  if (seconds < 86400) return `${seconds / 3600}h`;
  return `${seconds / 86400}d`;
}

/**
 * Requests that work as written against one stream — what the docs page
 * shows when a stream is opened. Built from the catalogue so a stream added
 * later gets its own without anyone writing them: a system-level feed sends
 * no `node` (the API answers 400 to one), a large stream names a real entity
 * from its own sample, and an event stream is counted in buckets rather than
 * read row by row.
 */
export function streamExamples(s: Schema): { label: string; path: string }[] {
  const base = `/v1/datasets/${s.dataset}`;
  const system = s.entities.count <= 1 && s.entities.sample.length === 0;
  const node = system ? null : s.entities.sample[0] ?? null;
  const nodeParam = node ? `node=${encodeURIComponent(node)}&` : "";
  const out = [{ label: "The catalogue entry — every column, its type and the source", path: base }];
  if (!system) out.push({ label: "The entities in it, with coverage", path: `${base}/nodes?limit=20` });
  if (s.tally) {
    out.push({
      label: "How many were issued a day",
      path: `${base}/query?interval=1d&by=none&stamp=noon&limit=30`,
    });
    return out;
  }
  out.push({ label: node ? `The newest rows for ${node}` : "The newest rows", path: `${base}/query?${nodeParam}limit=12` });
  if (grainSeconds(s) < 3600) {
    out.push({
      label: node ? `Hourly maximum for ${node}` : "Hourly maximum",
      path: `${base}/query?${nodeParam}interval=1h&agg=max&limit=24`,
    });
  }
  return out;
}

/**
 * The same API as an MCP server, for agents that take tools rather than
 * URLs. Written from `backend/src/dryos/api/mcp_server.py`: a tool added
 * there is added here.
 */
export const MCP_URL = `${PUBLIC_API}/mcp`;

export const MCP_TOOLS: { name: string; summary: string }[] = [
  { name: "list_streams", summary: "Every stream, filterable by domain, grid operator or a word." },
  { name: "describe_stream", summary: "One stream's columns, key, source, health and recent collector changes." },
  { name: "find_entities", summary: "Look up node, zone or station names — never guess one." },
  { name: "column_values", summary: "The distinct values of a text column, for filters." },
  {
    name: "query_stream",
    summary:
      "Rows, raw or bucketed; times in ISO-8601 or relative (-24h). At most 2,000 a call. Each result carries restUrl — the same request as a GET, ready for an app.",
  },
];

/** The site, for links that leave this deployment — the same reason
    `PUBLIC_API` is fixed. The www host is the primary one: the apex
    redirects to it, so a canonical, a sitemap entry or an MCP URL on the
    apex would name a redirect — which search engines read as a mixed signal
    and which MCP clients will not follow on a POST. */
export const SITE = "https://www.dryos.ai";

/**
 * The profiles that are unmistakably this Dryos.
 *
 * "DRYOS" is also Canon's real-time operating system, which has a Wikipedia
 * article and therefore owns the bare word in every index. Nothing on this
 * site can outrank that by asserting harder — what separates two entities
 * sharing a name is corroboration: the same organisation, described the same
 * way, at several addresses that link back here. `sameAs` on the
 * Organization is where a search engine reads that set.
 *
 * Only profiles that actually load belong here. An entry pointing at a page
 * that does not is worse than none, because it is the one claim in the
 * structured data a crawler can check and find false.
 */
export const PROFILES: string[] = ["https://github.com/claytonhorning/dryos-workspace"];

/** What Dryos is, in the words the entity should be known by — distinct from
    the camera operating system that shares the name. */
export const ORG_DESCRIPTION =
  "A marketplace for live energy, weather and property data. Maintainers collect and publish data streams and are paid for them; buyers consume them through an API, an MCP server or a dashboard.";

/**
 * The public repo people clone to build on Dryos data from their own
 * infrastructure: the workspace itself, mirrored out of this monorepo with
 * `git subtree split` (see "The public mirror" in the root CLAUDE.md). The
 * clone block renders nothing while GitHub does not answer for it as a public
 * repo (`lib/github.ts`), so the site never links to a 404. Set
 * `DRYOS_GITHUB_REPO` to point somewhere else.
 */
export const GITHUB_REPO = process.env.DRYOS_GITHUB_REPO || "claytonhorning/dryos-workspace";

/** The operators the power streams cover, in the order the product names them. */
export const OPERATORS = ["ERCOT", "MISO", "PJM", "SPP", "CAISO", "NYISO", "ISO-NE"];

/** One line an agent directory or a search result can quote whole. Kept
    under the registry's hundred characters, because `server.json` reads it. */
export const MCP_TAGLINE = "Live US power market prices, load, generation, weather and permits for AI agents.";

/**
 * How each client adds a remote server. A UI-only client gets its steps as
 * `code` too, so every entry renders as one copyable block. The first two are
 * what the docs page shows; `/mcp` shows them all.
 */
export const MCP_CLIENTS: { label: string; code: string; lang?: string }[] = [
  { label: "Claude Code", code: `claude mcp add --transport http dryos ${MCP_URL}` },
  {
    label: "Cursor · ~/.cursor/mcp.json",
    lang: "json",
    code: JSON.stringify({ mcpServers: { dryos: { url: MCP_URL } } }, null, 2),
  },
  {
    label: "Claude.ai & Claude Desktop",
    lang: "steps",
    code: `Settings → Connectors → Add custom connector\nName: Dryos\nURL:  ${MCP_URL}`,
  },
  {
    label: "ChatGPT (developer mode)",
    lang: "steps",
    code: `Settings → Apps & Connectors → Create\nURL: ${MCP_URL}\nAuthentication: none`,
  },
  {
    label: "VS Code · .vscode/mcp.json",
    lang: "json",
    code: JSON.stringify({ servers: { dryos: { type: "http", url: MCP_URL } } }, null, 2),
  },
  {
    label: "Windsurf · mcp_config.json",
    lang: "json",
    code: JSON.stringify({ mcpServers: { dryos: { serverUrl: MCP_URL } } }, null, 2),
  },
  { label: "Gemini CLI", code: `gemini mcp add --transport http dryos ${MCP_URL}` },
  {
    label: "Codex · ~/.codex/config.toml",
    lang: "toml",
    code: `[mcp_servers.dryos]\nurl = "${MCP_URL}"`,
  },
];

/** One-click installs, where the client registers a link scheme for it. */
export const MCP_DEEPLINKS: { label: string; href: string }[] = [
  {
    label: "Add to Cursor",
    href: `cursor://anysphere.cursor-deeplink/mcp/install?name=dryos&config=${btoa(JSON.stringify({ url: MCP_URL }))}`,
  },
  {
    label: "Add to VS Code",
    href: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "dryos", type: "http", url: MCP_URL }))}`,
  },
];

/**
 * The second MCP server: workspaces in the signed-in user's own account.
 * Written from `lib/workspace/mcpTools.ts`; a tool added there is added here.
 */
export const WORKSPACE_MCP_URL = `${SITE}/api/mcp`;

export const WORKSPACE_MCP_TOOLS: { name: string; summary: string }[] = [
  { name: "list_workspaces", summary: "Your workspaces and their pages, with links." },
  { name: "list_community", summary: "The workspaces Dryos publishes for everyone — one per grid operator — with a link to view each page and copy it." },
  { name: "copy_community", summary: "Your own editable copy of a community workspace, every page included, ready for add_tile." },
  { name: "list_components", summary: "The tile shapes and their settings, and the published recipes a page can start from." },
  { name: "create_workspace", summary: "A new workspace with its first page, blank or from a recipe." },
  { name: "add_page", summary: "Another page in a workspace." },
  { name: "add_tile", summary: "A chart, ticker, bar, table, map, heatmap or title on live data — compiled before it is saved." },
  { name: "get_page", summary: "What is on a page and where." },
];

export const WORKSPACE_MCP_ADD = `claude mcp add --transport http dryos-workspace ${WORKSPACE_MCP_URL}`;

/** Questions the tools answer as written — what to try first. */
export const MCP_PROMPTS = [
  "What was the highest real-time price at ERCOT's Houston hub in the last 24 hours, and when?",
  "Compare the hourly average price at ERCOT's North hub, PJM's Western hub and MISO's Indiana hub over the past week.",
  "Which NYISO zones are pricing above $100 right now?",
  "Build me a React dashboard of CAISO's NP15 and SP15 real-time prices that refreshes every five minutes.",
  "How many roofing permits did San Antonio issue each week this quarter?",
];

export const QUICKSTART = `curl "${PUBLIC_API}/v1/datasets/ercot-realtime-lmp/query?node=HB_NORTH&limit=2"`;

/** A real answer to the quick start (2026-09-13), trimmed of nothing. */
export const QUICKSTART_RESPONSE = `{
  "dataset": "ercot-realtime-lmp",
  "rows": [
    {
      "interval_start_utc": "2026-09-13T19:10:19Z",
      "iso": "ERCOT",
      "market": "RTM",
      "node": "HB_NORTH",
      "node_type": "HUB",
      "lmp_total": 27.04,
      "lmp_energy": null,
      "lmp_congestion": null,
      "lmp_loss": null,
      "source_published_at_utc": "2026-09-13T19:10:22Z",
      "collected_at_utc": "2026-09-13T19:11:40.143691Z",
      "lat": null,
      "lon": null
    },
    …
  ],
  "count": 2,
  "servedTo": null
}`;

/**
 * What an agent is told. Written as instructions, not as reference: the
 * routes are the what, and the rules are the part that stops an agent
 * answering with a plausible wrong number — a Central timestamp read as UTC,
 * a guessed node name, a forecast's revisions stacked into one series.
 */
export function agentInstructions(): string {
  const streams = apiStreams(null)
    .map((s) => {
      const sample = s.entities.sample.length ? ` — e.g. ${s.entities.sample.slice(0, 3).join(", ")}` : "";
      return `- \`${s.dataset}\` — ${s.name} (${s.path.join(" › ")}), a row every ${every(grainSeconds(s))}${sample}`;
    })
    .join("\n");

  const routes = ROUTES.map((r) => `- \`GET ${r.path}\` — ${r.summary}`).join("\n");

  const tools = MCP_TOOLS.map((t) => `- \`${t.name}\` — ${t.summary}`).join("\n");
  const connect = MCP_CLIENTS.filter((c) => !c.lang || c.lang === "toml")
    .map((c) => `- ${c.label}: \`${c.code.replace(/\n/g, " ")}\``)
    .join("\n");

  // Shaped to llmstxt.org: a title, a one-paragraph summary as a quote, then
  // sections. The MCP server leads because an agent that can take tools
  // should never be building URLs.
  return `# Dryos

> Dryos serves real, reconciled data — US power markets (${OPERATORS.join(", ")}), weather, and building permits — collected live from the source, through a remote MCP server for AI agents and a public read-only REST API. No key needed.

## MCP server

URL: ${MCP_URL}
Transport: Streamable HTTP. No key, no sign-up, read-only. Details and every client: ${SITE}/mcp

Tools:
${tools}

Connect:
${connect}
- Cursor, VS Code, Windsurf and other JSON configs: \`{"mcpServers": {"dryos": {"url": "${MCP_URL}"}}}\`
- Claude.ai, Claude Desktop, ChatGPT: add a custom connector with the URL above and no authentication.

The rules below hold for the tools and the REST API alike.

## Workspace MCP server (builds in the user's account)

URL: ${WORKSPACE_MCP_URL}
Transport: Streamable HTTP. Requires signing in with a Dryos account (OAuth 2.1; the client opens the login and consent page itself). Use it with the data server: find streams and entity names there, then build here.

Tools:
${WORKSPACE_MCP_TOOLS.map((t) => `- \`${t.name}\` — ${t.summary}`).join("\n")}

Connect: \`${WORKSPACE_MCP_ADD}\`, or add a custom connector with the URL above in Claude.ai, Claude Desktop or ChatGPT.

## REST API

Base URL: ${PUBLIC_API}
Every route is GET and answers JSON. No API key is needed today. If you send \`Authorization: Bearer <token>\`, it must be a valid Dryos access token: a bad or expired token is refused with 401, never served anonymously. Reference: ${SITE}/docs

## How to answer a question

1. **Find the stream.** \`GET /v1/datasets\` lists every stream. Match the question to a \`slug\`, then read its \`schema\` (every column, with type and description) and \`serving\`: \`entity\` is the column that names a node/zone/station, \`measure\` the headline value, \`unit\` its unit.
2. **Find the entity.** \`GET /v1/datasets/{slug}/nodes?q=<text>\` searches entity names. Names are verbatim, inner spaces included (\`ALDENE  230 KV  T-10\`). Never guess one — look it up.
3. **Read the rows.** \`GET /v1/datasets/{slug}/query?node=<entity>&start=<ISO>&end=<ISO>&limit=<n>\`. Raw rows come newest first; \`limit\` defaults to 1000 and stops at 50000.
4. **Aggregate long windows.** Past a day or so of five-minute data, add \`interval=1h\` (or \`15m\`, \`1d\`, \`all\`) and \`agg=avg|min|max|sum\`. Each bucket carries \`samples\`, the readings in it: a bucket of 1 is not a bucket of 12, and a low count is a collection gap.

## Rules that prevent wrong answers

- **Every timestamp is UTC**, ISO-8601. \`interval_start_utc\` is the start of the interval. Convert only for display: ERCOT and SPP are US Central, MISO is EST all year (never EDT), PJM, NYISO and ISO-NE are US Eastern with daylight saving, CAISO is US Pacific.
- \`start\` is inclusive and \`end\` exclusive.
- **Forecasts keep every publication.** By default you get the newest vintage of each interval; \`vintages=all\` returns every one, stamped by \`source_published_at_utc\`. Do not average vintages together.
- **Null means the source did not report it**, never zero.
- \`node\` filters on the entity whatever the stream calls it. System-level feeds have no entity and answer 400 to it.
- \`where=column=value\` filters a text column (repeat on one column for OR; different columns AND). \`search=column:text\` is a case-insensitive substring. Numbers and timestamps cannot be filtered this way.
- Price streams that are \`located\` carry \`lat\`/\`lon\` — the generating plant's coordinates. Hubs, zones and unplaced nodes are null.
- 404 is an unknown slug; 503 means the stream has not been collected yet; 400 explains what was wrong with the request in words.
- Do not poll faster than a stream's cadence. To hear when data lands, hold \`GET /v1/events\` open (server-sent events: \`{"dataset", "at"}\`) and query on the name.
- Cite the slug and the interval timestamps behind any number you report.

## Example

\`\`\`
curl "${PUBLIC_API}/v1/datasets/ercot-realtime-lmp/query?node=HB_NORTH&interval=1h&agg=max&start=2026-09-12T00:00:00Z"
\`\`\`

The hourly maximum real-time price at ERCOT's North hub since midnight UTC on 12 September.

## Routes

${routes}

## Streams

${streams}
`;
}
