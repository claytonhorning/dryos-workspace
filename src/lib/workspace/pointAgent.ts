import Anthropic from "@anthropic-ai/sdk";
import type { AskTile, AskTurn, TileAsk } from "./ask";
import { SCHEMAS, pathLabel } from "./catalog";
import { TOOLS, runTool } from "./dataAgent";
import { chatModel, effortOf } from "./models";

/**
 * The agent behind a click on a tile.
 *
 * The data explorer's guide answers "what exists"; this one answers "what am
 * I looking at". It is handed what the frame packed at the click — the point
 * under the pointer, the rows the tile holds, a digest of the rest of the
 * screen — and it answers from that first. The same tools the guide carries
 * are here for the question the screen cannot answer on its own ("what was
 * it doing yesterday"), and for the same reason: a number this agent quotes
 * is a number it read, not one it remembers about ERCOT.
 *
 * The context goes in as the first user turn and the conversation follows
 * it, so a follow-up costs the prefix nothing new and the model never loses
 * the tile it was asked about.
 */

export type PointEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "error"; message: string };

const SYSTEM = `You answer questions about a dashboard the person is looking at right now.
They clicked on a tile; you are told which one, the point under their pointer,
the rows that tile holds, and a digest of every other tile on the screen.

Rules:
- Answer from the screen first. The rows you are given are the ones on show;
  quote numbers from them, with the interval and the unit, and say which tile
  or series they came from when it is not obvious.
- Use a tool only for what the screen cannot tell you — a longer window, an
  entity that is not on the screen, what a stream is. Never state a value
  from memory.
- Timestamps in the rows are UTC ISO strings. The person sees clocks in the
  timezone named below; when you quote a time, quote it in that zone and
  name the zone.
- Rows are a slice: \`count\` is how many the tile holds. Say so if a question
  needs rows you were not given, and read more with a tool.
- A series marked mock is generated, not collected. Say "mock" every time you
  quote one.
- lmp_energy, lmp_congestion and lmp_loss are always null for ERCOT. Say so if
  asked, and never chart them.
- Be brief: two to four plain sentences. No headings, no bullet lists, no
  markdown — this is a small window beside the tile.
- You cannot change the screen. If asked to, say the Edit mode's panel does
  that.`;

/** The streams behind a set of queries, from the catalogue — path, freshness, whether the numbers are real. */
function streamsOf(tiles: AskTile[]): string {
  const seen = new Map<string, string>();
  for (const t of tiles) {
    for (const s of t.series) {
      const id = String(s.query.dataset ?? "");
      if (!id || seen.has(id)) continue;
      const schema = SCHEMAS.find((x) => x.id === id || x.dataset === id);
      seen.set(
        id,
        schema
          ? `${id}: ${pathLabel(schema)} — ${schema.availability.toUpperCase()}, ${schema.cadence.label}${
              schema.availability === "mock" ? " (generated rows, not collected)" : ""
            }`
          : `${id}: not in the catalogue`,
      );
    }
  }
  return [...seen.values()].join("\n");
}

function describeTile(t: AskTile): string {
  const head = `Tile ${t.index}${t.title ? ` — ${t.title}` : ""}${t.unit ? ` (${t.unit})` : ""}`;
  if (!t.series.length) return `${head}\n  (no rows registered — the tile fetches its own data)`;
  const series = t.series.map((s) => {
    const q = JSON.stringify(s.query);
    const rows = s.rows.length
      ? `${s.rows.length} of ${s.count} rows, columns ${s.columns.join(", ")}:\n${s.rows
          .map((r) => "    " + JSON.stringify(r))
          .join("\n")}`
      : "no rows";
    return `  query ${q}\n  ${rows}`;
  });
  return `${head}\n${series.join("\n")}`;
}

/** Everything the frame packed, as one message the model reads once. */
export function describeAsk(ask: TileAsk, page: string, tz: string): string {
  const point = ask.point
    ? ask.point.row
      ? `The clicked table row: ${ask.point.row.join(" · ")}`
      : [
          `The point under the pointer: ${ask.point.label ?? ""}`,
          ask.point.at ? ` (${ask.point.at} UTC)` : "",
          ask.point.entity ? `, entity ${ask.point.entity}` : "",
          ask.point.values?.length
            ? ` — ${ask.point.values
                .map((v) => `${v.name}: ${v.value == null ? "—" : String(v.value)}${v.unit ? ` ${v.unit}` : ""}`)
                .join("; ")}`
            : "",
        ].join("")
    : "No particular point was under the pointer — the click was on the tile as a whole.";

  const zone =
    tz === "source"
      ? "each stream's own operating time (ERCOT streams: US Central; weather: UTC)"
      : tz;

  return [
    `Page: ${page}`,
    `Display timezone: ${zone}`,
    "",
    `Streams on this screen:\n${streamsOf([ask.tile, ...ask.screen]) || "(none)"}`,
    "",
    `CLICKED — ${describeTile(ask.tile)}`,
    "",
    point,
    "",
    ask.screen.length
      ? `The rest of the screen, newest rows only:\n\n${ask.screen.map(describeTile).join("\n\n")}`
      : "There are no other tiles on the screen.",
  ].join("\n");
}

export async function explain(
  input: {
    ask: TileAsk;
    page: string;
    tz: string;
    history: AskTurn[];
    question: string;
    model?: string;
    effort?: string;
  },
  emit: (e: PointEvent) => void,
) {
  const client = new Anthropic();
  // Validated against the roster, never trusted as strings, and shaped per
  // model: effort is a 400 on Haiku 4.5.
  const picked = chatModel(input.model);
  const effort = effortOf(input.effort);

  const context = describeAsk(input.ask, input.page, input.tz);
  // The context is its own turn, acknowledged, so the transcript that follows
  // is an ordinary conversation and the prefix stays byte-identical across
  // follow-ups.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Here is what is on the screen.\n\n${context}` },
    { role: "assistant", content: "I have the screen. What would you like to know?" },
    ...input.history
      .filter((t) => t.text.trim())
      .map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: "user", content: input.question },
  ];

  // A couple of tool turns is plenty for a question about one tile; the cap
  // is there so a confused loop cannot bill indefinitely.
  for (let turn = 0; turn < 4; turn++) {
    const stream = client.messages.stream({
      model: picked.id,
      max_tokens: 2000,
      system: SYSTEM,
      tools: TOOLS,
      ...(picked.effort ? { output_config: { effort } } : {}),
      messages,
    });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));
    const response = await stream.finalMessage();

    if (response.stop_reason !== "tool_use") return;

    const calls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    messages.push({ role: "assistant", content: response.content });
    emit({ type: "text", text: "\n\n" });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const out = await runTool(call.name, call.input as Record<string, unknown>);
        emit({ type: "tool", name: call.name, summary: out.summary });
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

  emit({ type: "error", message: "Gave up after four turns." });
}
