import Anthropic from "@anthropic-ai/sdk";
import {
  LIVE_SCHEMA,
  SCHEMAS,
  type DataRef,
  type Schema,
  makeRef,
  pathLabel,
  querySnippet,
  schemaFor,
  tokenLabel,
} from "./catalog";
import { mockRows } from "./mockData";

/**
 * The data explorer's agent.
 *
 * A different job from the one that edits apps, so a different agent: this one
 * only reads the catalogue. It cannot touch an app, and the build agent cannot
 * query the feed — keeping them apart means neither can quietly do the other's
 * work badly, and the answers here are always grounded in a tool call rather
 * than in what the model remembers about ERCOT.
 *
 * Every reference it hands back is derived from a tool it actually ran, not
 * from its prose. That is what makes the chips clickable with any confidence:
 * they describe data the server just fetched, and they carry that data's
 * availability, cadence and price with them so the build box can show all three
 * without asking anything a second time.
 */

const MODEL = "claude-opus-5";
const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";

export type { DataRef };

export type AskEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "ref"; ref: DataRef }
  | { type: "error"; message: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "browse_schemas",
    description:
      "List the schema tree — domain › sector › stream — with each schema's availability " +
      "(live or mock), update cadence, price in Dryos tokens per query, and its variables. " +
      "Use this first for any question about what exists, what is real, or what something costs.",
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Restrict to one domain, e.g. 'Energy' or 'Weather'. Omit for all.",
        },
      },
    },
  },
  {
    name: "search_nodes",
    description:
      "Find entities inside a schema — settlement points, zones, hubs. Use for questions like " +
      "'what is available for HB_NORTH' or 'which load zones exist'. Always use this rather " +
      "than guessing names.",
    input_schema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: `Schema id, e.g. "${LIVE_SCHEMA.id}". Defaults to the live one.`,
        },
        query: {
          type: "string",
          description: "Substring to match, e.g. 'HB_' or 'NORTH'. Omit to list everything.",
        },
        node_type: {
          type: "string",
          enum: ["HUB", "LOAD_ZONE", "DC_TIE", "RESOURCE_NODE"],
          description: "Restrict to one classification. Live schema only.",
        },
        limit: { type: "number", description: "Max entities to return, default 25." },
      },
    },
  },
  {
    name: "schema_detail",
    description:
      "The declared columns of one schema, with types, descriptions and which are always null. " +
      "Use before describing what a caller can chart or compute.",
    input_schema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema id. Defaults to the live one." },
      },
    },
  },
  {
    name: "read_values",
    description:
      "Read actual rows from a schema. Use to answer questions about levels, spreads or recent " +
      "movement. Returns a summary plus the newest rows so you can quote real numbers. On a mock " +
      "schema the numbers are synthetic — say so whenever you quote one.",
    input_schema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema id. Defaults to the live one." },
        node: { type: "string", description: "Entity, e.g. HB_NORTH." },
        start: { type: "string", description: "Relative window such as -1h, -6h, -24h, -7d." },
        limit: { type: "number", description: "Rows to read, default 200, max 1000." },
      },
      required: ["node"],
    },
  },
];

const TREE = SCHEMAS.map(
  (s) =>
    `- ${pathLabel(s)} — ${s.name} · ${s.availability.toUpperCase()} · ${s.cadence.label} · ${tokenLabel(s.tokens)}/query`,
).join("\n");

const SYSTEM = `You help someone find out what data is available in the Dryos catalogue,
so they can reference it when asking a separate build agent for a chart or a table.

Data is organised as a tree of schemas — domain › sector › stream — not as dataset
slugs. Always name a schema by its path.

${TREE}

Only ${pathLabel(LIVE_SCHEMA)} is collected. It is ERCOT real-time locational
marginal prices, about 1,100 settlement points, repriced roughly every five
minutes. Every other schema is a MOCK: the shape is real, the numbers are
generated, and an app built on one will run but must not be trusted.

Rules:
- Check with a tool before you answer. Never state an entity name, a column or a
  price from memory — this feed is live and you have no idea what it says.
- Say "mock" out loud every single time you mention one. Never let a synthetic
  number stand next to a real one without the word.
- Whenever you point someone at a schema, give its cadence and its price in
  Dryos tokens per query. That is what an app will burn each refresh.
- Be brief. Two or three sentences, then let the reference chips do the work.
- Quote real numbers when you have them, with the interval they came from.
- lmp_energy, lmp_congestion and lmp_loss are ALWAYS null for ERCOT. Say so if
  someone asks about price components, and never suggest charting them.
- Close by naming what could be built with what you found — one clause, no
  markdown headings, no bullet lists.
- You do not build anything. If asked to, say the build box beside you does that
  and hand over the reference.`;

async function callApi(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Dryos API ${res.status} on ${path}`);
  return res.json();
}

function resolve(input: Record<string, unknown>): Schema {
  return schemaFor(input.schema ? String(input.schema) : undefined) ?? LIVE_SCHEMA;
}

/** Entities for a mock schema, straight from its declaration. */
function mockEntities(schema: Schema, limit: number): string[] {
  const rows = mockRows({ dataset: schema.id, start: "-1h", limit: 1 });
  return [...new Set(rows.map((r) => String(r.node)))].slice(0, limit);
}

/** Runs one tool and returns both its result text and any chips it produced. */
async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<{ text: string; refs: DataRef[]; summary: string }> {
  if (name === "browse_schemas") {
    const domain = input.domain ? String(input.domain).toLowerCase() : null;
    const matched = SCHEMAS.filter(
      (s) => !domain || s.path[0].toLowerCase() === domain,
    );

    const refs: DataRef[] = matched.flatMap((s) => [
      // The chip already carries the path on its own line, so the label is the
      // schema's name rather than a second copy of it.
      makeRef(s, {
        kind: "schema",
        label: s.name,
        sublabel: `${s.entities.count.toLocaleString()} ${s.entities.label}`,
        snippet: querySnippet(s),
      }),
      ...s.variables.map((v) =>
        makeRef(s, {
          kind: "variable",
          label: v.label,
          sublabel: `${v.key} · ${v.unit}`,
          availability: v.availability,
          snippet: querySnippet(s, s.entities.sample[0]),
        }),
      ),
    ]);

    return {
      text: JSON.stringify(
        matched.map((s) => ({
          id: s.id,
          path: pathLabel(s),
          name: s.name,
          availability: s.availability,
          cadence: s.cadence.label,
          tokensPerQuery: s.tokens,
          entities: `${s.entities.count} ${s.entities.label}`,
          blurb: s.blurb,
          variables: s.variables.map((v) => ({
            key: v.key,
            label: v.label,
            unit: v.unit,
            availability: v.availability,
            description: v.description,
          })),
        })),
      ),
      refs,
      summary: `browsed the tree — ${matched.length} schema${matched.length === 1 ? "" : "s"}, ${
        matched.filter((s) => s.availability === "live").length
      } live`,
    };
  }

  const schema = resolve(input);

  if (name === "search_nodes") {
    const limit = Number(input.limit ?? 25);

    if (schema.availability === "mock") {
      const q = input.query ? String(input.query).toUpperCase() : null;
      const found = mockEntities(schema, 200).filter((n) => !q || n.includes(q));
      const refs: DataRef[] = found.slice(0, 12).map((n) =>
        makeRef(schema, {
          kind: "entity",
          label: n,
          sublabel: `${schema.entities.label.replace(/s$/, "")} · mock`,
        }),
      );
      return {
        text: JSON.stringify({ schema: schema.id, mock: true, entities: found.slice(0, limit) }),
        refs,
        summary: `listed ${found.length} mock ${schema.entities.label}`,
      };
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (input.query) params.set("q", String(input.query));
    if (input.node_type) params.set("node_type", String(input.node_type));
    const data = (await callApi(`/v1/datasets/${schema.dataset}/nodes?${params}`)) as {
      coverage: { rows: number; nodes: number; earliest: string; latest: string };
      nodes: { node: string; nodeType: string; observations: number; lastSeen: string }[];
    };

    const refs: DataRef[] = data.nodes.slice(0, 12).map((n) =>
      makeRef(schema, {
        kind: "entity",
        label: n.node,
        sublabel: `${n.nodeType.toLowerCase().replace("_", " ")} · ${n.observations.toLocaleString()} obs`,
      }),
    );

    return {
      text: JSON.stringify({
        coverage: data.coverage,
        matched: data.nodes.length,
        nodes: data.nodes.map((n) => ({
          node: n.node,
          type: n.nodeType,
          observations: n.observations,
          lastSeen: n.lastSeen,
        })),
      }),
      refs,
      summary: `searched ${pathLabel(schema)}${input.query ? ` for “${input.query}”` : ""} — ${data.nodes.length} found`,
    };
  }

  if (name === "schema_detail") {
    if (schema.availability === "mock") {
      return {
        text: JSON.stringify({
          path: pathLabel(schema),
          availability: "mock",
          cadence: schema.cadence.label,
          tokensPerQuery: schema.tokens,
          columns: schema.variables,
        }),
        refs: schema.variables.map((v) =>
          makeRef(schema, {
            kind: "variable",
            label: v.label,
            sublabel: `${v.key} · ${v.unit}`,
            availability: v.availability,
            snippet: querySnippet(schema, schema.entities.sample[0]),
          }),
        ),
        summary: `read the mock schema — ${schema.variables.length} variables`,
      };
    }

    const spec = (await callApi(`/v1/datasets/${schema.dataset}`)) as {
      schema: { name: string; type: string; description: string; nullReason?: string }[];
    };
    return {
      text: JSON.stringify({
        path: pathLabel(schema),
        availability: "live",
        cadence: schema.cadence.label,
        tokensPerQuery: schema.tokens,
        columns: spec.schema,
      }),
      refs: [],
      summary: `read ${pathLabel(schema)} — ${spec.schema.length} columns`,
    };
  }

  if (name === "read_values") {
    const node = String(input.node);
    const start = String(input.start ?? "-24h");
    const limit = Math.min(Number(input.limit ?? 200), 1000);

    // Same resolution the apps get, so the numbers quoted here are the numbers
    // an app would receive.
    const ms = /^-(\d+)([mhd])$/.exec(start);
    const since = ms
      ? new Date(
          Date.now() -
            Number(ms[1]) * (ms[2] === "m" ? 6e4 : ms[2] === "h" ? 36e5 : 864e5),
        ).toISOString()
      : start;

    const field =
      schema.availability === "live" ? "lmp_total" : (schema.variables[0]?.key ?? "value");

    const rows =
      schema.availability === "mock"
        ? mockRows({ dataset: schema.id, node, start: since, limit })
        : (
            (await callApi(
              `/v1/datasets/${schema.dataset}/query?node=${encodeURIComponent(node)}&start=${encodeURIComponent(since)}&limit=${limit}`,
            )) as { rows: Record<string, unknown>[] }
          ).rows;

    const values = rows.map((r) => r[field]).filter((v): v is number => typeof v === "number");
    const stats = values.length
      ? {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          latest: values[0],
          latestInterval: rows[0]?.interval_start_utc,
        }
      : { count: 0 };

    return {
      text: JSON.stringify({
        schema: pathLabel(schema),
        availability: schema.availability,
        node,
        window: start,
        field,
        stats,
        newest: rows.slice(0, 5),
      }),
      refs: [
        makeRef(schema, {
          kind: "query",
          label: `${node} · ${start}`,
          sublabel: values.length
            ? `${values.length} intervals${schema.availability === "mock" ? " · generated" : ""}`
            : "no rows",
          snippet: querySnippet(schema, node, start),
        }),
      ],
      summary: `read ${values.length} intervals for ${node}${schema.availability === "mock" ? " (mock)" : ""}`,
    };
  }

  throw new Error(`Unknown tool ${name}`);
}

export async function ask(question: string, emit: (e: AskEvent) => void) {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  // A handful of turns is plenty for "what exists and what does it say"; the
  // cap is there so a confused loop cannot bill indefinitely.
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));
    const response = await stream.finalMessage();

    if (response.stop_reason !== "tool_use") return;

    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    messages.push({ role: "assistant", content: response.content });

    // The next turn continues the sentence otherwise: "…for that node.HB_NORTH
    // has 1,921 intervals".
    emit({ type: "text", text: "\n\n" });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const out = await runTool(call.name, call.input as Record<string, unknown>);
        emit({ type: "tool", name: call.name, summary: out.summary });
        for (const ref of out.refs) emit({ type: "ref", ref });
        results.push({ type: "tool_result", tool_use_id: call.id, content: out.text });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: err instanceof Error ? err.message : "tool failed",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  emit({ type: "error", message: "Gave up after six turns." });
}
