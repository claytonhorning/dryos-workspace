import { PUBLIC_API } from "@/lib/apiDocs";
import { SCHEMAS, domains, entityRef, streamRef, type DataRef, type Schema } from "./catalog";
import { communityComponents, communityGroups, recipePage } from "./community";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  GRID,
  below,
  clearOf,
  componentDef,
  minTileHeight,
  minTileWidth,
  packLayout,
  type ComponentKind,
  type ComponentSpec,
  type Placed,
} from "./components";
import { composeApp, describeComponent } from "./compose";
import { compile } from "./runtime";
import { ALL_DOMAINS, addPage, createSpace, getSpace, listSpaces, spaceOfPage } from "./spaces";
import { addRevision, createApp, getApp, listApps } from "./store";
import { listCommunitySpaces } from "./communitySpaces";
import { BLANK } from "./templates";

/**
 * The workspace MCP server's tools: what an agent signed in as a user may do
 * to that user's workspaces. They call the same store and compose code the
 * editor does, inside `asBearer`, so every row is RLS-scoped to the token's
 * user and every page is compiled before it is saved — an agent gets no
 * shortcut past the gate a person's drop goes through.
 *
 * Nothing here deletes. A signed-in agent can do anything its user can, and
 * the first version of that is additive: a workspace, a page, a tile, each
 * recorded as a revision that the editor's history can take back.
 */

export class ToolError extends Error {}

export interface ToolContext {
  origin: string;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean | string>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const API = (process.env.DRYOS_API_URL || PUBLIC_API).replace(/\/$/, "");

export const INSTRUCTIONS = `\
Dryos workspaces are live dashboards in the signed-in user's own Dryos account: a workspace holds pages, a page holds tiles (charts, tickers, tables, maps, bars, heatmaps, text).

To build one:
1. Find the data with the Dryos data MCP server (${API}/mcp): list_streams for the stream slug, find_entities for exact node, zone or station names. Never guess a name — it is verbatim, inner spaces included.
2. create_workspace (optionally starting from a published recipe — list_components lists them).
3. add_tile for each piece: a shape, a stream slug, and the entities it shows. Tiles land left to right, top to bottom.
4. Give the user the page URL.

To show what Dryos has already published, list_community lists the community workspaces (one per grid operator, and more to come) with a view URL for each page. They are read-only: the user opens one and presses Make a copy to have it as their own.

A chart takes one to four series (up to eight of one unit); a ticker exactly one; a bar two to eight of one unit. add_tile refuses anything a shape cannot draw and says why. Nothing here deletes; every change is a revision the user can revert in the editor.`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function pageUrl(origin: string, space: string, page: string) {
  return `${origin}/workspace/${space}/${page}`;
}

/** The catalogue entry for a slug the data server hands out, or its catalogue id. */
function streamOf(stream: string): Schema {
  const s = SCHEMAS.find((x) => x.dataset === stream || x.id === stream);
  if (!s || !s.dataset || s.availability !== "live") {
    throw new ToolError(
      `No live stream "${stream}". Use a slug from the Dryos data MCP server's list_streams, e.g. ercot-realtime-lmp.`,
    );
  }
  return s;
}

/**
 * Names must be the source's own. Checked against the API's entity search so
 * a guessed node is refused here rather than saved as a tile that never
 * draws; if the API cannot be asked, the names are let through unchecked.
 */
async function checkEntities(dataset: string, names: string[]) {
  const missing: string[] = [];
  for (const name of names) {
    try {
      const res = await fetch(
        `${API}/v1/datasets/${dataset}/nodes?q=${encodeURIComponent(name)}&limit=50`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { nodes?: { node: string }[] };
      const found = body.nodes ?? [];
      if (!found.some((n) => n.node === name)) {
        const near = found.slice(0, 5).map((n) => n.node);
        missing.push(near.length ? `"${name}" (close: ${near.join(", ")})` : `"${name}"`);
      }
    } catch {
      return;
    }
  }
  if (missing.length) {
    throw new ToolError(
      `Not in ${dataset}: ${missing.join("; ")}. Look names up with find_entities; they are verbatim.`,
    );
  }
}

/** The first spot, reading left to right and top to bottom, where a tile this size fits. */
function firstClear(manifest: ComponentSpec[], w: number, h: number): { x: number; y: number } {
  const taken = manifest.map((m) => m.layout as Placed);
  const floor = below(manifest) + (manifest.length ? GRID.gap : 0);
  const rows = [...new Set(taken.map((t) => t.y))].sort((a, b) => a - b);
  for (const y of rows) {
    for (let x = 0; x + w <= GRID.cols; x++) {
      if (clearOf({ x, y, w, h }, taken)) return { x, y };
    }
  }
  return { x: 0, y: floor };
}

/** A new page in a workspace — blank, or a published recipe unpacked — compiled before it is saved. */
async function newPage(spaceId: string, name: string | undefined, recipe: string | undefined) {
  let manifest: ComponentSpec[] = [];
  if (recipe) {
    const r = recipePage(recipe);
    if (!r) throw new ToolError(`No published recipe "${recipe}". list_components lists them.`);
    manifest = packLayout(r.manifest);
    name ||= r.name;
  }
  const source = composeApp(manifest);
  if (manifest.length) {
    const built = await compile(source);
    if (!built.js) throw new ToolError(`The page did not compile: ${built.error}`);
  }
  const app = await createApp({ name: name || "Page 1", template: BLANK.slug, source, manifest });
  await addPage(spaceId, app.id);
  return app;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export const TOOLS: Tool[] = [
  {
    name: "list_workspaces",
    title: "List workspaces",
    description: "The user's workspaces and the pages in each, with their URLs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(_args, { origin }) {
      const [spaces, apps] = await Promise.all([listSpaces(), listApps()]);
      const names = new Map(apps.map((a) => [a.id, a.name]));
      return {
        workspaces: spaces.map((s) => ({
          id: s.id,
          name: s.name,
          domain: s.domain ?? null,
          pages: s.pages.map((p) => ({ id: p, name: names.get(p) ?? null, url: pageUrl(origin, s.id, p) })),
        })),
      };
    },
  },
  {
    name: "list_community",
    title: "List community workspaces",
    description:
      "The workspaces Dryos has published for everyone — ERCOT, MISO, PJM and the other grid operators — and their pages, each with a view URL. Read-only here: the user opens one and presses Make a copy to get their own. Filter with domain (Energy, Weather, Property).",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Only this catalogue domain: Energy, Weather or Property." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args, { origin }) {
      const domain = str(args.domain).toLowerCase();
      const spaces = await listCommunitySpaces();
      return {
        workspaces: spaces
          .filter((s) => !domain || domain === "all" || !s.domain || s.domain.toLowerCase() === domain)
          .map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain ?? null,
            url: s.pages[0] ? `${origin}/workspace/community/${s.id}/${s.pages[0].id}` : null,
            pages: s.pages.map((p) => ({
              id: p.id,
              name: p.name,
              url: `${origin}/workspace/community/${s.id}/${p.id}`,
            })),
          })),
      };
    },
  },
  {
    name: "list_components",
    title: "List components",
    description:
      "The shapes a tile can take (with their options and choices), and the published components and wired groups a page can start from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      return {
        shapes: COMPONENTS.filter((c) => !c.sourceOnly).map((c) => ({
          shape: c.kind,
          name: c.name,
          what: c.blurb,
          options: JSON.parse(JSON.stringify(c.options)),
          size: DEFAULT_LAYOUT[c.kind],
        })),
        recipes: [
          ...communityComponents().map((c) => ({ recipe: c.id, name: c.name, what: c.blurb, shape: c.kind })),
          ...communityGroups().map((g) => ({
            recipe: g.id,
            name: g.name,
            what: g.blurb,
            shape: "group",
            tiles: g.members.length,
          })),
        ],
      };
    },
  },
  {
    name: "get_page",
    title: "Read a page",
    description: "One page's tiles: shape, data, settings and place on the twelve-column grid.",
    inputSchema: {
      type: "object",
      properties: { page_id: { type: "string" } },
      required: ["page_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args, { origin }) {
      const app = await getApp(str(args.page_id));
      if (!app) throw new ToolError("No such page in this account.");
      const space = await spaceOfPage(app.id);
      return {
        id: app.id,
        name: app.name,
        url: space ? pageUrl(origin, space.id, app.id) : null,
        editable: Boolean(app.manifest),
        tiles: (app.manifest ?? []).map((m, i) => ({
          index: i,
          shape: m.kind,
          data: m.refs.map((r) => r.label),
          options: m.options ?? {},
          layout: m.layout,
        })),
      };
    },
  },
  {
    name: "create_workspace",
    title: "Create a workspace",
    description:
      "Create a workspace with one page, blank or started from a published recipe (see list_components). Returns the page to add tiles to.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "What the workspace is about, e.g. 'Houston desk'." },
        domain: {
          type: "string",
          description: `Where its data explorer opens: ${domains().join(", ")}, or "all".`,
        },
        page_name: { type: "string", description: "The first page's name. Default 'Page 1' or the recipe's." },
        recipe: { type: "string", description: "A published recipe slug to start the page from." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async run(args, { origin }) {
      const name = str(args.name) || "New workspace";
      const d = str(args.domain);
      const domain = d === ALL_DOMAINS || domains().includes(d) ? d : undefined;
      const space = await createSpace(name, domain);
      const page = await newPage(space.id, str(args.page_name) || undefined, str(args.recipe) || undefined);
      return {
        workspace_id: space.id,
        page_id: page.id,
        url: pageUrl(origin, space.id, page.id),
        tiles: page.manifest?.length ?? 0,
      };
    },
  },
  {
    name: "add_page",
    title: "Add a page",
    description: "Add a page to a workspace, blank or started from a published recipe.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string" },
        name: { type: "string" },
        recipe: { type: "string", description: "A published recipe slug (see list_components)." },
      },
      required: ["workspace_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async run(args, { origin }) {
      const space = await getSpace(str(args.workspace_id));
      if (!space) throw new ToolError("No such workspace in this account.");
      const page = await newPage(space.id, str(args.name) || undefined, str(args.recipe) || undefined);
      return { page_id: page.id, url: pageUrl(origin, space.id, page.id), tiles: page.manifest?.length ?? 0 };
    },
  },
  {
    name: "add_tile",
    title: "Add a tile",
    description:
      "Add a chart, ticker, bar, table, map, heatmap or text tile to a page, on live data. " +
      "`stream` is a slug from the Dryos data MCP server; `entities` are exact names from its find_entities " +
      "(omit them to take the whole stream, which suits small streams like fuel mix). " +
      "`options` are the shape's settings from list_components, e.g. {\"window\": \"-7d\", \"shape\": \"area\"}; a text tile takes {\"text\": \"...\"}.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        shape: {
          type: "string",
          enum: COMPONENTS.filter((c) => !c.sourceOnly).map((c) => c.kind),
        },
        stream: { type: "string", description: "Stream slug, e.g. ercot-realtime-lmp. Not needed for text." },
        entities: { type: "array", items: { type: "string" }, description: "Exact entity names." },
        variable: { type: "string", description: "Which column to show, when not the stream's headline measure." },
        options: { type: "object", additionalProperties: { type: "string" } },
        width: { type: "number", description: "Columns of twelve." },
        height: { type: "number", description: "Pixels." },
      },
      required: ["page_id", "shape"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async run(args, { origin }) {
      const kind = str(args.shape) as ComponentKind;
      const def = componentDef(kind);
      if (!def || def.sourceOnly) throw new ToolError(`No shape "${kind}". list_components lists them.`);

      const options = Object.fromEntries(
        Object.entries((args.options ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      );

      let refs: DataRef[] = [];
      if (kind === "text") {
        if (!options.text) throw new ToolError('A text tile needs options.text, e.g. {"text": "Houston desk"}.');
      } else {
        const schema = streamOf(str(args.stream));
        const variable = str(args.variable) || undefined;
        if (variable && !schema.variables.some((v) => v.key === variable)) {
          throw new ToolError(
            `${schema.dataset} has no "${variable}". Its columns: ${schema.variables.map((v) => v.key).join(", ")}.`,
          );
        }
        const entities = Array.isArray(args.entities) ? args.entities.map(String).filter(Boolean) : [];
        if (entities.length) {
          await checkEntities(schema.dataset!, entities);
          refs = entities.map((e) => entityRef(schema, e, variable));
        } else {
          refs = [streamRef(schema, variable)];
        }
      }

      const verdict = def.accepts(refs);
      if (!verdict.ok) throw new ToolError(verdict.why ?? `A ${kind} cannot draw that.`);

      const app = await getApp(str(args.page_id));
      if (!app) throw new ToolError("No such page in this account.");
      if (!app.manifest) {
        throw new ToolError("That page was rewritten by the model and has no tile layout; add a new page instead.");
      }

      const manifest = packLayout(app.manifest);
      const base = DEFAULT_LAYOUT[kind];
      const w = clamp(Number(args.width) || base.w, minTileWidth(kind), GRID.cols);
      const h = clamp(Number(args.height) || base.h, minTileHeight(kind), 1200);
      manifest.push({ kind, refs, options, layout: { w, h, ...firstClear(manifest, w, h) } });

      const placed = packLayout(manifest);
      const source = composeApp(placed);
      const built = await compile(source);
      if (!built.js) throw new ToolError(`The tile did not compile: ${built.error}`);

      const what = describeComponent(kind, refs);
      await addRevision(app.id, {
        intent: what,
        refs: refs.length ? refs : undefined,
        manifest: placed,
        source,
        author: "agent",
        note: "Added through the workspace MCP server.",
      });
      const space = await spaceOfPage(app.id);
      return {
        added: what,
        tile: placed.length - 1,
        url: space ? pageUrl(origin, space.id, app.id) : null,
      };
    },
  },
];
