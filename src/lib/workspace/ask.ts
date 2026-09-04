/**
 * What a double click on a launched tile carries out of the frame.
 *
 * The frame is the only thing that can see the data a tile is drawing, so it
 * packs the answer itself (`askPayload` in the generated runtime, `compose.ts`)
 * and the host opens the chat over it. Three parts, all optional in practice:
 * the point under the pointer — whichever readout was showing, or the table
 * row that was pressed — the clicked tile's own rows, and a digest of every
 * other tile on the screen, because "compared to what" is usually the next
 * question. Nothing here is fetched twice: it is the rows the tile already
 * holds, trimmed for the wire.
 */

export interface AskValue {
  name: string;
  value: unknown;
  unit: string;
}

export interface AskPoint {
  /** ISO instant of the reading, when the readout had one. */
  at?: string | null;
  /** The readout's own caption — the clock as the tile showed it. */
  label?: string | null;
  /** The entity (node, station, cell) the reading belongs to, if any. */
  entity?: string | null;
  values?: AskValue[];
  /** A table row's cells, when the click was on a row rather than a readout. */
  row?: string[];
}

export interface AskSeries {
  /** The `dryos.query` the rows came from — dataset, node, window. */
  query: Record<string, unknown>;
  /** How many rows the tile holds; `rows` is a slice of them. */
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface AskTile {
  index: number;
  title: string | null;
  unit: string | null;
  series: AskSeries[];
}

export interface TileAsk {
  index: number;
  point: AskPoint | null;
  tile: AskTile;
  screen: AskTile[];
}

/** One turn of the chat, as the route receives it back for context. */
export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

/** One line for the header: "14:35 CDT · HB_NORTH 42.10 $/MWh". */
export function pointCaption(point: AskPoint | null): string | null {
  if (!point) return null;
  if (point.row) return point.row.slice(0, 4).join(" · ");
  const vals = (point.values ?? [])
    .slice(0, 3)
    .map((v) => {
      const n =
        typeof v.value === "number"
          ? Math.abs(v.value) >= 1000
            ? v.value.toFixed(0)
            : v.value.toFixed(2)
          : v.value == null
            ? "—"
            : String(v.value);
      return `${v.name} ${n}${v.unit ? ` ${v.unit}` : ""}`;
    });
  return [point.label, ...vals].filter(Boolean).join(" · ") || null;
}
