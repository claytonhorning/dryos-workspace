import Anthropic from "@anthropic-ai/sdk";
import { SCHEMAS, type DataRef, pathLabel, tokenLabel } from "./catalog";
import { chatModel, effortOf } from "./models";
import { compile } from "./runtime";

/**
 * The edit loop.
 *
 * A change is generated, compiled, and only then saved. If it does not build,
 * the error goes back to the model once and it tries again; if it still does
 * not build, nothing is written and the app keeps running the version it had.
 * That is the same shape as the collector pipeline — stage, validate, promote —
 * applied to code instead of rows, and it is what makes "just talk to it and
 * save" safe enough to use on something you depend on.
 */

const MODEL = "claude-opus-5";

const TREE = SCHEMAS.map(
  (s) =>
    `  ${s.id.padEnd(26)} ${pathLabel(s)} — ${s.availability.toUpperCase()}, ${s.cadence.label}, ${tokenLabel(s.tokens)}/query\n` +
    s.variables.map((v) => `      ${v.key} (${v.unit}) — ${v.description}`).join("\n"),
).join("\n");

const SYSTEM = `You edit a single-file React app for an energy-market workspace.

# Output
Return the COMPLETE file in exactly one \`\`\`tsx fenced block. Any prose outside
the fence is shown to the user as a one-line note about what you changed — keep
it to a single short sentence, no preamble.

# The file
- Default-exports one React component. No other exports.
- May import hooks from "react". Import nothing else — there is no router, no
  chart library, no CSS framework, no network client.
- Runs in a sandboxed frame with no network access of its own.

# Data
A global \`dryos\` object is the only way to reach data:

  await dryos.query({
    dataset: "ercot-realtime-lmp",
    node: "HB_HOUSTON",   // or an array of nodes; omit for all
    start: "-6h",         // relative, or an ISO timestamp
    end:   "-1h",         // optional
    limit: 500,           // per node
  })  // -> { rows, count }

\`dryos.HUBS\` and \`dryos.ZONES\` are arrays of the real ERCOT settlement points.
With an array of nodes and \`limit: 1\`, you get the newest interval for each.

Row shape for ercot-realtime-lmp:
  interval_start_utc  ISO 8601 string, always UTC
  node                settlement point, e.g. "HB_HOUSTON"
  node_type           HUB | LOAD_ZONE | DC_TIE | RESOURCE_NODE
  lmp_total           number, $/MWh — the only price field with values
  lmp_energy, lmp_congestion, lmp_loss   ALWAYS null for ERCOT; never display them
  source_published_at_utc, collected_at_utc   ISO 8601 strings

# The catalogue
Data is organised as schemas — domain › sector › stream. Pass the id below as
\`dataset\`. Every row carries \`interval_start_utc\` and \`node\` whatever the schema.

${TREE}

Only the live schema is collected. The rest return generated rows of the right
shape at the right cadence, so an app built on one runs — but it is NOT real
data. Whenever an app reads a mock schema, label it in the UI: a small
\`MOCK\` tag beside that number or series, in \`--info\` blue. Never let a
synthetic value sit unlabelled next to a live one.

Poll each schema at its own cadence, not faster — the row will not have changed
and every call is billed. Always clear the interval on unmount.

# Charts
Recharts is available — \`import { AreaChart, Area, LineChart, Line, XAxis, YAxis,
CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"\`.
Use it for anything time-series. Never hand-roll an SVG polyline: a chart the
reader cannot hover is not finished.

House rules for charts:
- Wrap in \`<ResponsiveContainer width="100%" height={220}>\` — a pixel height is
  required, a percentage one collapses to nothing.
- Always include \`<Tooltip>\` with a custom \`content\`. The default tooltip is
  white and unreadable here. Write one like this:

    function ChartTip({ active, payload, label }) {
      if (!active || !payload?.length) return null;
      return (
        <div style={{
          background: "var(--surface-2)", border: "1px solid var(--line-strong)",
          borderRadius: 6, padding: "6px 9px", fontSize: 12,
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>
            {new Date(label).toISOString().slice(11, 16)}Z
          </div>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>
            \${payload[0].value.toFixed(2)}/MWh
          </div>
        </div>
      );
    }

- Pass the timestamp as a number (\`Date.parse(row.interval_start_utc)\`) with
  \`<XAxis dataKey="t" type="number" scale="time" domain={["dataMin","dataMax"]}>\`.
- \`isAnimationActive={false}\` on every series — data that refreshes on a timer
  should not replay its entrance each time.
- \`dot={false}\` for dense series; use \`activeDot\` for the hover point.
- Grid: \`<CartesianGrid stroke="var(--line)" vertical={false} />\`. Horizontal
  only — the reader is comparing price, not time.
- Axis ticks: \`tick={{ fill: "var(--faint)", fontSize: 11 }}\`,
  \`stroke="var(--line)"\`, \`tickLine={false}\`.
- Add \`<ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />\`
  whenever a series can go negative.

# Style
Inline styles only. Use these CSS variables so the app matches its surroundings:
  --bg --surface --surface-2 --line --line-strong
  --ink --muted --faint --accent --warn --info --fail --mono
\`--accent\` is an acid chartreuse: use it for emphasis and healthy signals,
\`--warn\` amber for thresholds breached, \`--fail\` red for errors.

# Rules
- Always handle the loading and error states; a thrown query must not blank the app.
- Never invent schemas, columns or node names beyond those listed.
- Preserve everything the user did not ask you to change.
- Prefer the smallest change that satisfies the request.`;

export interface EditResult {
  source?: string;
  note?: string;
  error?: string;
}

/**
 * Progress, as it happens.
 *
 * A change takes the better part of a minute, and a button that says "Working…"
 * for forty seconds is indistinguishable from one that has hung. These events
 * are what the workspace shows instead.
 */
export type EditEvent =
  | { type: "phase"; phase: "thinking" | "writing" | "compiling" | "retrying" }
  | { type: "thinking"; text: string }
  | { type: "writing"; lines: number }
  | { type: "note"; text: string }
  | { type: "error"; message: string };

function extract(text: string): { code: string | null; note: string } {
  const fence = text.match(/```(?:tsx|jsx|ts|js)?\s*\n([\s\S]*?)```/);
  const note = text.replace(/```[\s\S]*?```/g, "").trim().split("\n")[0] ?? "";
  return { code: fence ? fence[1].trim() : null, note };
}

/**
 * The data half of a request, expanded from the chips attached to it.
 *
 * The user's sentence stays their sentence — the query text lives here instead,
 * generated from the reference rather than typed into the box. That is the same
 * split the revision stores, so replaying an old change onto a diverged app
 * re-expands its references against today's catalogue rather than replaying a
 * call expression that may no longer be the right one.
 */
export function describeRefs(refs: DataRef[]): string {
  if (!refs.length) return "";
  const lines = refs.map((r) => {
    const schema = SCHEMAS.find((x) => x.id === r.schemaId);
    const tag = r.availability === "mock" ? " [MOCK — label it in the UI]" : "";
    return `- ${r.path}${r.label && r.label !== r.path ? ` · ${r.label}` : ""}${tag}\n` +
      `  ${r.snippet}\n` +
      `  updates ${r.cadence}; ${tokenLabel(r.tokens)} per query${
        schema ? `; poll no faster than ${schema.cadence.seconds}s` : ""
      }`;
  });
  return `\n\nUse this data:\n${lines.join("\n")}`;
}

export async function editApp(input: {
  source: string;
  intent: string;
  refs?: DataRef[];
  /**
   * A generated component to work from.
   *
   * When someone picks a shape *and* asks for a change to it, the typed
   * generator has already written code that queries the right data at the right
   * cadence. Handing that over is a better prompt than the request alone: the
   * model adapts working code instead of reconstructing it, and the parts that
   * are tedious to get right — poll intervals, tooltips, null handling — arrive
   * correct.
   */
  seed?: string;
  /**
   * The composer's model and effort, validated against `models.ts` — never
   * trusted as strings. Per-model shape rules live there too: effort is a 400
   * on Haiku 4.5, adaptive thinking does not exist there, and the refusal
   * fallback is Opus 5 / Fable 5 only.
   */
  model?: string;
  effort?: string;
  onEvent?: (e: EditEvent) => void;
}): Promise<EditResult> {
  const emit = input.onEvent ?? (() => {});
  const client = new Anthropic();
  const picked = chatModel(input.model);
  const effort = effortOf(input.effort);
  const seed = input.seed
    ? `\n\nHere is a generated component that already does the data part. Fold it into the app, keeping its query and refresh behaviour:\n\n\`\`\`tsx\n${input.seed}\n\`\`\``
    : "";
  const request = `${input.intent}${describeRefs(input.refs ?? [])}${seed}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Here is the current app:\n\n\`\`\`tsx\n${input.source}\n\`\`\`\n\nChange requested:\n\n${request}`,
    },
  ];

  // Two attempts: the first from the request, the second from the build error.
  for (let attempt = 0; attempt < 2; attempt++) {
    emit({ type: "phase", phase: attempt === 0 ? "thinking" : "retrying" });

    let response: Anthropic.Beta.BetaMessage;
    try {
      // Streamed for two reasons: a whole file can be long enough to risk an
      // HTTP timeout on a single response, and the workspace needs something
      // truthful to show while it is being written.
      const stream = client.beta.messages.stream({
        model: picked.id,
        max_tokens: 16000,
        system: SYSTEM,
        ...(picked.adaptive
          ? { thinking: { type: "adaptive" as const, display: "summarized" as const } }
          : {}),
        ...(picked.effort ? { output_config: { effort } } : {}),
        ...(picked.fallback
          ? {
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default" as const,
            }
          : {}),
        messages,
      });

      let written = "";
      let announcedWriting = false;
      for await (const event of stream) {
        if (event.type !== "content_block_delta") continue;
        if (event.delta.type === "thinking_delta") {
          emit({ type: "thinking", text: event.delta.thinking });
        } else if (event.delta.type === "text_delta") {
          written += event.delta.text;
          if (!announcedWriting && written.includes("```")) {
            announcedWriting = true;
            emit({ type: "phase", phase: "writing" });
          }
          if (announcedWriting) {
            emit({ type: "writing", lines: written.split("\n").length });
          }
        }
      }
      response = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return {
          error:
            "No Anthropic credentials. Add ANTHROPIC_API_KEY to frontend/.env.local and restart the dev server.",
        };
      }
      return { error: err instanceof Error ? err.message : "The model call failed." };
    }

    if (response.stop_reason === "refusal") {
      return { error: "The model declined that request." };
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const { code, note } = extract(text);
    if (!code) {
      // The model answered in words — a question got an answer, not a file.
      // That answer IS the result; reporting "no code block" threw it away
      // and made every question the agent was asked read as a failure.
      const prose = text.replace(/```[\s\S]*?```/g, "").trim();
      return {
        error: prose ? prose.slice(0, 600) : "The model returned no code block.",
      };
    }
    if (note) emit({ type: "note", text: note });

    emit({ type: "phase", phase: "compiling" });
    const built = await compile(code);
    if (built.js) return { source: code, note };

    if (attempt === 1) {
      return { error: `The change did not compile: ${built.error}` };
    }
    emit({ type: "error", message: `Did not build — trying again: ${built.error}` });

    // Hand the build error back and let it correct itself.
    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `That failed to compile:\n\n${built.error}\n\nReturn the corrected complete file.`,
      },
    );
  }

  return { error: "The change could not be compiled." };
}


/**
 * Rewrite one component, not a whole app.
 *
 * A narrower job than `editApp` and a much narrower blast radius: the model
 * receives a single section function that already queries the right data at the
 * right cadence, and returns the same function changed. It cannot touch the rest
 * of the dashboard because it never sees it.
 *
 * Compiled in place — wrapped in a throwaway app, because a bare function is not
 * something esbuild can check on its own — so a refinement that does not build
 * is refused here rather than at the point someone adds it to a dashboard.
 */
export async function refineComponent(input: {
  code: string;
  ask: string;
  compileWith: (sectionCode: string) => string;
  onEvent?: (e: EditEvent) => void;
}): Promise<{ code?: string; note?: string; error?: string }> {
  const emit = input.onEvent ?? (() => {});
  const client = new Anthropic();

  const system = `You modify ONE React component from an energy-market dashboard.

# Output
Return the COMPLETE function in exactly one \`\`\`tsx fenced block, keeping its
existing name and its \`({ w, h })\` signature. Any prose outside the fence is
shown to the user as a one-line note — one short sentence, no preamble.

# Rules
- Return only that function. No imports, no exports, no other declarations.
- These are already in scope and must not be redeclared: React, useEffect,
  useMemo, useRef, useState, useSeries, useMapbox, Section, ChartTip, dryos, and
  every recharts export.
- Keep the \`<Section index={…} w={w} h={h}>\` wrapper and its props. The host
  measures and resizes tiles through it.
- Keep the existing \`useSeries\` call and its refresh interval unless the request
  is specifically about what data is fetched or how often.
- Inline styles only, using these variables: --bg --surface --surface-2 --line
  --line-strong --ink --muted --faint --accent --warn --info --fail --mono.
- Anything drawn from a mock schema keeps its MOCK tag.
- Change the smallest amount that satisfies the request.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Here is the component:\n\n\`\`\`tsx\n${input.code}\n\`\`\`\n\nChange requested:\n\n${input.ask}`,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    emit({ type: "phase", phase: attempt === 0 ? "thinking" : "retrying" });

    let response: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 12000,
        system,
        thinking: { type: "adaptive", display: "summarized" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      });
      for await (const event of stream) {
        if (event.type !== "content_block_delta") continue;
        if (event.delta.type === "thinking_delta") {
          emit({ type: "thinking", text: event.delta.thinking });
        }
      }
      response = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return {
          error:
            "No Anthropic credentials. Add ANTHROPIC_API_KEY to frontend/.env.local and restart the dev server.",
        };
      }
      return { error: err instanceof Error ? err.message : "The model call failed." };
    }

    if (response.stop_reason === "refusal") return { error: "The model declined that." };

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const { code, note } = extract(text);
    if (!code) {
      // The model answered in words — a question got an answer, not a file.
      // That answer IS the result; reporting "no code block" threw it away
      // and made every question the agent was asked read as a failure.
      const prose = text.replace(/```[\s\S]*?```/g, "").trim();
      return {
        error: prose ? prose.slice(0, 600) : "The model returned no code block.",
      };
    }

    emit({ type: "phase", phase: "compiling" });
    const built = await compile(input.compileWith(code));
    if (built.js) return { code, note };

    if (attempt === 1) return { error: `That did not compile: ${built.error}` };
    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `That failed to compile:\n\n${built.error}\n\nReturn the corrected complete function.`,
      },
    );
  }

  return { error: "The refinement could not be compiled." };
}
