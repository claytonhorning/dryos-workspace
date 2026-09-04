import {
  DRAW_CAP,
  type DataRef,
  grainSeconds,
  schemaFor,
  sourceTzOf,
} from "./catalog";
import {
  ERCOT_POINTS,
  ERCOT_VIEW,
  hasGeography,
} from "./geo";
import { MOCK_POINT_SOURCE } from "./geoMock";
import { schemaById } from "./catalog";
import { SERIES_PALETTE } from "./palette";

/**
 * Typed components.
 *
 * A chart of a series is not a creative act. It is the same forty lines every
 * time, and the only thing that changes is which dataset, which column and how
 * often to poll — all of which the reference already carries. So these render
 * from a template rather than from a model: pick data, pick a shape, and the
 * code is written, compiled and saved without a single token spent.
 *
 * The model is still there for the part it is good at. Typing a sentence
 * alongside a component hands the generated code to the agent as a starting
 * point, which is a far better prompt than a blank file — it modifies working
 * code instead of inventing it.
 *
 * Every generator emits one self-contained function plus the recharts names it
 * needs. `compose.ts` stitches them into a file.
 */

export type ComponentKind =
  | "chart"
  | "scatter"
  | "distribution"
  | "bar"
  | "heatmap"
  | "ticker"
  | "table"
  | "map"
  | "picker";

export interface ComponentSpec {
  kind: ComponentKind;
  refs: DataRef[];
  /** Settings chosen in the builder. Missing keys fall back to the default. */
  options?: Record<string, string>;
  /**
   * Where it sits on the canvas: `x` columns from the left of twelve, `y`
   * pixels from the top, `w` columns wide, `h` pixels tall.
   *
   * The position is the load-bearing half. A tile used to have only a place in
   * a sequence, which meant moving one necessarily pushed every one after it —
   * a tile could not be somewhere, only after something. With a place of its
   * own a move moves one tile, a hole left behind stays a hole, and nothing on
   * the canvas is derived from anything else's position.
   *
   * `x`/`y` are optional because pages written before this existed have none;
   * `packLayout` flows those into the arrangement the old grid gave them, once,
   * on the next write.
   *
   * A dropped tile arrives deliberately small and is resized by dragging its
   * corner. Sizing a component is a judgement about the dashboard around it, not
   * about the component, so it is not something a generator can guess.
   */
  layout?: { x?: number; y?: number; w: number; h: number };
  /**
   * A saved custom component: its name and its finished section source.
   *
   * Present once someone has built one in the component editor. The source is
   * stored rather than regenerated because a refinement may have been written by
   * the agent, and nothing can reproduce that from `kind` and `options`.
   */
  custom?: { name: string; code: string };
}

/**
 * A setting on a component.
 *
 * Everything is a choice from a short list, including the numbers. A free text
 * box would mean validating input, handling nonsense, and finding somewhere to
 * put an error — for "how tall" and "how far back" the list of sensible answers
 * is four items long, so the control is a list and none of that exists.
 */
export interface Option {
  key: string;
  label: string;
  choices: { value: string; label: string }[];
  fallback: string;
}

export interface Emitted {
  code: string;
  /** Named recharts imports this section needs. */
  imports: string[];
}

export interface ComponentDef {
  kind: ComponentKind;
  name: string;
  blurb: string;
  options: Option[];
  /** Whether this shape can render the chosen references, and why not. */
  accepts: (refs: DataRef[]) => {
    ok: boolean;
    why?: string;
  };
  /**
   * Whether this shape is on the table for the selection at all.
   *
   * Different from `accepts`, and the difference is whether there is anything
   * worth reading. A shape that fails `accepts` stays on the shelf greyed, with
   * its reason — "four series is the most one chart reads well" is information.
   * A shape that is not offered is one the selection has simply moved past: a
   * ticker beside three series is not a rejected ticker, it is the answer to a
   * question nobody asked, and greying it out only makes the shelf longer.
   */
  offered?: (refs: DataRef[]) => boolean;
  emit: (
    refs: DataRef[],
    index: number,
    options: Record<string, string>,
  ) => Emitted;
}

/**
 * Chosen values on top of the defaults, so a generator can read `o.key` flatly.
 *
 * Anything not declared as an `Option` is carried through rather than dropped.
 * Per-series color and line style live in `series` as one JSON string: they
 * are settings, but their choices come from the selection rather than from the
 * shape, so they are not a list this can render a select from — and a filter
 * that only kept declared keys silently threw them away between the panel and
 * the generator.
 */
export function withDefaults(
  def: ComponentDef,
  options?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {
    ...(options ?? {}),
  };
  for (const o of def.options)
    out[o.key] = options?.[o.key] ?? o.fallback;
  return out;
}

const WINDOWS = [
  { value: "-6h", label: "Last 6 hours" },
  { value: "-24h", label: "Last 24 hours" },
  { value: "-7d", label: "Last 7 days" },
];

/* ── Helpers shared by the generators ─────────────────────────────────── */

/** The dataset id an app passes to `dryos.query`. */
function target(ref: DataRef): string {
  return schemaFor(ref.schemaId)?.dataset ?? ref.schemaId;
}

/** The column a reference points at. Schema-level refs take the first variable. */
function column(ref: DataRef): string {
  const schema = schemaFor(ref.schemaId);
  if (!schema) return "value";
  const key = ref.sublabel?.split(" · ")[0];
  return schema.variables.some((v) => v.key === key)
    ? key!
    : (schema.variables[0]?.key ?? "value");
}

function unit(ref: DataRef): string {
  const schema = schemaFor(ref.schemaId);
  const key = column(ref);
  return (
    schema?.variables.find((v) => v.key === key)?.unit ?? ""
  );
}

/**
 * The declared color stops for a selection's measure, if it has any.
 *
 * Read off the first reference, because a map's point layer draws one measure —
 * the same reference the unit and the column already come from. A selection
 * whose variable declares nothing returns null and the map scales itself.
 */
function pointScale(refs: DataRef[]) {
  const first = refs[0];
  if (!first) return null;
  const schema = schemaFor(first.schemaId);
  const key = column(first);
  return (
    schema?.variables.find((v) => v.key === key)?.scale ??
    null
  );
}

/** The entity a reference is about, when it names one. */
function node(ref: DataRef): string | null {
  const m = /node: "([^"]+)"/.exec(ref.snippet);
  return m ? m[1] : null;
}

/**
 * Forward-fill code for the slower series in a mixed-cadence selection.
 *
 * An hourly DAM price beside a five-minute LMP left the tooltip one-sided at
 * every timestamp the DAM did not publish — but the hourly price *is* the
 * price at 12:05, so holding it forward is the honest join, and it draws the
 * settled price as the step function it actually is. Same-cadence selections
 * emit nothing.
 */
function slowFill(
  refs: DataRef[],
  s: { key: string }[],
): string {
  // Grain, not cadence: "slower" here is about how far apart the rows are, not
  // about when the file arrived.
  const grains = refs.map(grainOf);
  const finest = Math.min(...grains);
  const slow = s
    .filter((_, i) => grains[i] > finest)
    .map((x) => x.key);
  if (!slow.length) return "";
  return `
    // A slower series holds its value between publishes — the hourly price is
    // still the price at :05 — so every hover has both sides to compare.
    const held = {};
    for (const row of sorted) {
      for (const k of ${JSON.stringify(slow)}) {
        if (row[k] !== undefined) held[k] = row[k];
        else if (held[k] !== undefined) row[k] = held[k];
      }
    }`;
}

/** Poll no faster than the schema publishes. Never below fifteen seconds. */
function refreshMs(refs: DataRef[]): number {
  const fastest = Math.min(
    ...refs.map((r) => r.cadenceSeconds),
  );
  return Math.max(15_000, Math.min(fastest, 900) * 1000);
}

function series(refs: DataRef[]) {
  const streams = new Set(refs.map((r) => r.schemaId));
  return refs.map((r, i) => {
    const n = node(r);
    // An entity-picked ref is already named by its entity; repeating it as
    // "HB_NORTH · HB_NORTH" would be a stutter.
    const base =
      n && n !== r.label ? `${r.label} · ${n}` : r.label;
    // Two streams can price the same entity — RT and DAM both quote
    // HB_NORTH — and a tooltip with two identical labels compares nothing.
    const stream = schemaFor(r.schemaId)?.name;
    return {
      key: `s${i}`,
      dataset: target(r),
      node:
        n ??
        schemaFor(r.schemaId)?.entities.sample[0] ??
        "",
      column: column(r),
      unit: unit(r),
      label:
        streams.size > 1 && stream
          ? `${base} — ${stream}`
          : base,
      // The two halves of the label, separately: the panel lists series in a
      // row too narrow for "HB_HOUSTON — ERCOT real-time LMP" to survive
      // truncation with the part that distinguishes intact.
      short: base,
      stream,
      mock: r.availability === "mock",
    };
  });
}

/*
  The eight series slots, as the variable names the frame defines them under.
  One length, one order, written from `palette.ts` so the panel that offers a
  color and the generator that emits one can never disagree about how many
  there are. Fixed is the point: a color follows the entity it was assigned
  to at selection time, never its rank, and the sequence itself is what was
  validated for color-vision safety. Never cycle past the end — `accepts`
  caps every shape at eight or fewer first. (This replaces the old four-slot
  list whose fourth entry was `var(--stale)`, a token no palette defined — the
  fourth series has been drawing in black since the day it shipped.)
*/
const PALETTE = SERIES_PALETTE.dark.map(
  (_, i) => `var(--s${i + 1})`,
);

/**
 * How a line is drawn, and the dash it means.
 *
 * Three, because they are the three a reader can tell apart at 1.6px on a
 * tile. Style is not decoration here: it is the second channel after color,
 * so a dashed line stays a dashed line when the chart is printed, screenshotted
 * into a deck, or read by someone who cannot separate two of the hues.
 */
export const SERIES_LINES = [
  { value: "solid", label: "Solid", dash: "" },
  { value: "dashed", label: "Dashed", dash: "7 5" },
  { value: "dotted", label: "Dotted", dash: "1 5" },
];

/**
 * One series' overrides: `c` a color, `d` a line style, `a` a y-axis.
 *
 * A color is either a palette slot — a number, which follows the theme, since
 * each mode has its own stepping — or a literal `#rrggbb` somebody picked, which
 * does not. That is the trade for arbitrary color and it is the caller's to
 * make; the panel says so where it is made.
 *
 * `a` is "l" or "r". Anything else — absent included — is the left axis, and
 * the right axis only exists once both sides have a series: everything moved
 * right is the same chart as everything left, so it is normalised away rather
 * than drawn as a chart whose one axis migrated.
 */
export interface SeriesStyle {
  c?: number | string;
  d?: string;
  a?: string;
}

/**
 * A literal color, if that is what this is.
 *
 * Six-digit hex and nothing else. It is not a validation nicety: the value is
 * interpolated straight into generated TSX as a string literal, so anything
 * that reaches `paint` unchecked would be writing code. Everything that fails
 * here falls back to a palette slot.
 */
export function seriesHex(
  c: number | string | undefined,
): string | null {
  return typeof c === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(c)
    ? c
    : null;
}

/** The overrides in `options.series`, which is JSON and may be anything. */
export function readSeries(
  options?: Record<string, string>,
): Record<string, SeriesStyle> {
  try {
    const v = JSON.parse(options?.series ?? "{}");
    return v && typeof v === "object"
      ? (v as Record<string, SeriesStyle>)
      : {};
  } catch {
    return {};
  }
}

/**
 * The series a shape will draw, as the panel needs to list them.
 *
 * `null` for a fan-out — a lone stream-level reference means *all* of it, and
 * which entities that is comes from the rows at runtime. Nothing here can name
 * them, so the panel says that rather than listing nothing.
 */
export function seriesSlots(
  refs: DataRef[],
):
  | {
      key: string;
      label: string;
      short: string;
      stream?: string;
    }[]
  | null {
  if (refs.length === 0) return [];
  if (refs.length === 1 && fanoutOf(refs[0])) return null;
  return series(refs).map((x) => ({
    key: x.key,
    label: x.label,
    short: x.short,
    stream: x.stream,
  }));
}

/** Which per-series controls a shape can honour. */
export function seriesControls(kind: ComponentKind): {
  color: boolean;
  line: boolean;
  axis: boolean;
} {
  // Only the chart has a second y-axis to offer: a scatter's two axes are the
  // two series, a bar has one measure by definition, and a stack sums — the
  // panel additionally hides the control for the stacked shape.
  if (kind === "chart")
    return { color: true, line: true, axis: true };
  if (kind === "distribution")
    return { color: true, line: true, axis: false };
  // A bar is a color and a length, and a scatter is a cloud of dots; neither
  // has a stroke to dash.
  if (kind === "bar" || kind === "scatter") {
    return { color: true, line: false, axis: false };
  }
  return { color: false, line: false, axis: false };
}

/**
 * The color and dash one series draws with.
 *
 * The default is still the slot the series' position earns, so a chart nobody
 * has touched looks exactly as it did — an override only exists where somebody
 * made one.
 */
function paint(
  styles: Record<string, SeriesStyle>,
  key: string,
  n: number,
): { color: string; dash: string } {
  const pick = styles[key] ?? {};
  const slot = typeof pick.c === "number" ? pick.c : n;
  const line =
    SERIES_LINES.find((l) => l.value === pick.d) ??
    SERIES_LINES[0];
  return {
    color:
      seriesHex(pick.c) ?? PALETTE[slot % PALETTE.length],
    dash: line.dash,
  };
}

/** `strokeDasharray={...}` when there is a dash to draw, nothing when there is not. */
function dashProp(dash: string): string {
  return dash ? `strokeDasharray="${dash}" ` : "";
}

/*
  Wires: one tile's selection retargeting another's queries.

  The channel is a window event inside the frame — `dryos:pick`, carrying the
  source tile's index and the entity that was clicked — the same idiom as the
  page's time cursor. The link is stored on the *receiver* as a ride-along
  option (`follow`, a tile index as a string), which is the same trick the
  per-series styles use: it travels through the preview URL, the drag payload
  and the manifest without any route learning a new field, and it replays
  like every other option. The map is the only source today; charts and
  tickers are the receivers.
*/

/** The ride-along `follow` option: the tile index whose selection to follow. */
function followOf(
  o: Record<string, string>,
): number | null {
  const n = Number(o.follow);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Whether a wire can land on this spec at all — the other half of `followOf`,
 * for the host's wiring panel. A fan-out discovers its own entities, a spread
 * is a derived series, and frozen source was not generated with the listener,
 * so a wire to any of them would silently do nothing — greying is honest.
 */
export function followable(spec: ComponentSpec): boolean {
  if (spec.kind !== "chart" && spec.kind !== "ticker")
    return false;
  if (spec.custom) return false;
  const refs = spec.refs ?? [];
  if (refs.length === 0) return false;
  if (
    spec.kind === "chart" &&
    spec.options?.combine === "spread"
  )
    return false;
  if (refs.length === 1 && fanoutOf(refs[0])) return false;
  return true;
}

/**
 * Whether a tile can be the *source* of a wire — whether it emits picks.
 *
 * The map does, by clicking a node; the search does, by choosing one out of
 * the stream's own entities, which is what a screen without a map (or with a
 * thousand nodes too dense to hit) needs instead. Frozen custom source was
 * not generated with the emitter, so a wire from it would silently do
 * nothing.
 */
export function emitsPicks(spec: {
  kind: ComponentKind;
  custom?: { name: string; code: string };
}): boolean {
  if (spec.custom) return false;
  return spec.kind === "map" || spec.kind === "picker";
}

/**
 * The receiver's half of a wire, as generated code: listen for the source
 * tile's picks and retarget every query's node at the picked entity. Emits
 * the plain `const queries = …` when there is no wire, so the caller's call
 * to `useSeries(queries, …)` is the same either way.
 */
function followSnippet(
  follow: number | null,
  queriesJson: string,
): string {
  if (follow === null)
    return `  const queries = ${queriesJson};`;
  return `  // Wired: tile ${follow}'s selected entity retargets these queries.
  const FOLLOW = ${follow};
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    const h = (e) => {
      const d = e.detail;
      // A null entity is a source clearing its selection, which is a pick
      // like any other: the tile goes back to the series it was composed
      // with rather than holding the last thing anybody clicked.
      if (d && d.source === FOLLOW) setPicked(d.entity || null);
    };
    window.addEventListener("dryos:pick", h);
    return () => window.removeEventListener("dryos:pick", h);
  }, []);
  const queries = useMemo(
    () => {
      const base = ${queriesJson};
      return picked ? base.map((q) => ({ ...q, node: picked })) : base;
    },
    [picked],
  );`;
}

/** One unit across the selection, or null when they mix. */
function uniformUnit(refs: DataRef[]): string | null {
  const units = [...new Set(refs.map(unit))];
  return units.length === 1 ? units[0] : null;
}

/**
 * What a tile is called. Up to three series, their labels fit in a title;
 * past that the stream's own name says it better than a five-label pile-up.
 */
function titleFor(
  refs: DataRef[],
  s: { label: string }[],
): string {
  if (refs.length > 3) {
    return (
      schemaFor(refs[0].schemaId)?.name ??
      s.map((x) => x.label).join(" · ")
    );
  }
  return s.map((x) => x.label).join(" · ");
}

/**
 * Whether a lone reference means "all of the stream".
 *
 * The explorer hands out stream- and variable-level chips, never entities, so
 * "chart the fuel mix" used to collapse to whichever entity happened to be the
 * catalogue's first sample. For a stream that declares an `entityKey` the
 * honest reading of that chip is every entity it has: the query drops its
 * entity filter and the emitted code pivots rows into one series per entity
 * at runtime — which also means an entity ERCOT adds next year shows up
 * without anyone recomposing the page.
 */
function fanoutOf(
  ref: DataRef,
): { key: string; omit: string[]; only?: string[] } | null {
  if (ref.kind === "entity" || ref.kind === "query")
    return null;
  const schema = schemaFor(ref.schemaId);
  if (!schema) return null;
  /*
    A subset chip fans out over exactly the entities it enumerates — the
    query carries them as its node filter, and the pivot keeps the list as a
    guard so a row the filter should have excluded cannot sneak a series in.

    It fans out even where the stream declares no `entityKey`: that flag
    means "small enough that *all of it* is a chart", and a big stream
    deliberately lacks it — but nine enumerated hubs are a chart whatever the
    other 1,109 are. The pivot column is then the map's `entityColumn`
    fallback chain, because it is the same question: which row column names
    the entity.
  */
  if (ref.subset?.entities.length) {
    return {
      key:
        schema.entityColumn ?? schema.entityKey ?? "node",
      omit: schema.entityOmit ?? [],
      only: ref.subset.entities,
    };
  }
  if (!schema.entityKey) return null;
  return {
    key: schema.entityKey,
    omit: schema.entityOmit ?? [],
  };
}

const WINDOW_SECONDS: Record<string, number> = {
  "-6h": 21_600,
  "-24h": 86_400,
  "-7d": 604_800,
};

/** Every span a shape can ask for, in seconds. Keys are query start values. */
const SPAN_SECONDS: Record<string, number> = {
  ...WINDOW_SECONDS,
  "-12h": 43_200,
  "-2d": 172_800,
  "-14d": 1_209_600,
  "-30d": 2_592_000,
};

/**
 * Seconds between two rows of this reference.
 *
 * Read from today's catalogue rather than from the stored reference, which
 * carries the publish cadence and predates the distinction — a page composed
 * last month still grids at the right resolution. See `grainSeconds`.
 */
function grainOf(ref: DataRef): number {
  const schema = schemaFor(ref.schemaId);
  return schema ? grainSeconds(schema) : ref.cadenceSeconds;
}

/**
 * What "source time" means for this component: its first reference's stream,
 * the same first-ref rule the unit and the color scale already follow. The
 * navbar's timezone choice resolves against it at runtime (`useTz`).
 */
function sourceTz(refs: DataRef[]): string {
  const schema = refs[0]
    ? schemaFor(refs[0].schemaId)
    : undefined;
  return schema ? sourceTzOf(schema) : "UTC";
}

/** Enough rows for every entity across the window, within the route's cap. */
function fanoutLimit(
  window: string,
  grainSecs: number,
  entities?: number,
): number {
  const span = WINDOW_SECONDS[window] ?? 86_400;
  // A subset fans out over a known count, so the budget is exact; the open
  // fan-out keeps the old ten-entity heuristic.
  const per = entities && entities > 0 ? entities : 10;
  return Math.min(
    10_000,
    Math.ceil(span / Math.max(grainSecs, 60)) * per,
  );
}

/** Rendered beside anything drawn from a schema with no collector. */
function mockTag(any: boolean): string {
  return any
    ? `        <span style={{ border: "1px dashed var(--info)", borderRadius: 3, color: "var(--info)", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".1em", padding: "0 4px", textTransform: "uppercase" }}>mock</span>\n`
    : "";
}

/*
 * A wired tile used to wear an accent chip — "⌁ wired to the map" — the way
 * the MOCK badge is worn. It is gone: the pair's own border already says the
 * two tiles answer each other, the title carries the picked node the moment
 * there is one, and a caption repeating both was the only chrome on a screen
 * meant to carry none. A drawn line between the tiles was refused for the
 * same reason, and stays refused.
 */

/* ── The shapes ───────────────────────────────────────────────────────── */

const chart: ComponentDef = {
  kind: "chart",
  name: "Chart",
  blurb:
    "A time series per selection, hoverable, on one set of axes.",
  options: [
    {
      key: "window",
      label: "Window",
      choices: WINDOWS,
      fallback: "-24h",
    },
    {
      key: "shape",
      label: "Shape",
      choices: [
        { value: "line", label: "Line" },
        { value: "area", label: "Area" },
        { value: "stacked", label: "Stacked area" },
      ],
      fallback: "line",
    },
    {
      // Only stacking reads this: which series sits at the bottom of the
      // stack. Line and area draw in selection order regardless.
      key: "order",
      label: "Stack order",
      choices: [
        { value: "size", label: "Largest first" },
        { value: "selection", label: "As selected" },
      ],
      fallback: "size",
    },
    {
      // Two series can also be one question: the difference. RT minus DAM at
      // a node is the basis trade, and asking for it should not require a
      // model. Read only when exactly two series are selected.
      key: "combine",
      label: "Combine",
      choices: [
        { value: "separate", label: "Series" },
        { value: "spread", label: "Spread (A − B)" },
      ],
      fallback: "separate",
    },
  ],
  // Up to four series read well overlapping. Five to eight only make sense
  // stacked, and stacking sums — so past four the units must agree.
  accepts: (refs) =>
    refs.length === 0
      ? { ok: false, why: "Pick a series." }
      : refs.length > 8
        ? {
            ok: false,
            why: "Eight series is the most one chart reads well.",
          }
        : refs.length > 4 && uniformUnit(refs) === null
          ? {
              ok: false,
              why: "Five or more series only work stacked, and a stack sums — these mix units.",
            }
          : { ok: true },
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Chart${i}`;
    // Whatever the panel painted. A fan-out has none of this: its series are
    // discovered from the rows, so their colors are assigned in there.
    const styles = readSeries(o);
    const stacked = o.shape === "stacked";
    const area = o.shape === "area";
    const Wrap =
      stacked || area ? "AreaChart" : "LineChart";
    const fan =
      refs.length === 1 ? fanoutOf(refs[0]) : null;
    // The spread only means anything for exactly two series; any other count
    // quietly draws them separately rather than failing a shape that renders.
    const spread =
      o.combine === "spread" && !fan && s.length === 2;
    const title = spread
      ? `${s[0].label} − ${s[1].label}`
      : fan
        ? // A subset chip already names itself ("… · Hubs"); the whole stream
          // goes by the stream's name.
          refs[0].subset
          ? refs[0].label
          : (schemaFor(refs[0].schemaId)?.name ??
            s[0].label)
        : titleFor(refs, s);
    // A day of a five-minute feed is 288 rows; a week is 2,016 — and a
    // fanned-out stream multiplies that by its entities. The limit follows
    // the window instead of quietly truncating the long one.
    const limit = fan
      ? fanoutLimit(
          o.window,
          grainOf(refs[0]),
          fan.only?.length,
        )
      : o.window === "-7d"
        ? 2000
        : 500;
    // A fanned-out chart is always several series, whatever its shape, so it
    // always carries the legend.
    const legend = stacked || fan;

    // A wire retargets per-node queries at the picked entity; a fan-out
    // discovers its own entities and a spread is a derived pair, so neither
    // can follow one.
    const follow = fan || spread ? null : followOf(o);

    /*
      A second y-axis, when any series was sent to it. Only for overlapping
      lines and areas: a stack sums onto one axis, a spread is one derived
      series, and a fan-out's series have no rows here to be assigned. All-right
      is normalised to all-left — the right axis exists to hold a second scale
      *against* the first, and with nothing on the left it is the same chart
      wearing its axis on the other side.
    */
    const axisOf = (key: string) =>
      styles[key]?.a === "r" ? "r" : "l";
    const dual =
      !stacked &&
      !fan &&
      !spread &&
      s.some((x) => axisOf(x.key) === "r") &&
      s.some((x) => axisOf(x.key) === "l");
    // Each axis wears the unit of what it carries; mixed units are the whole
    // reason to split axes, and the header saying only the left one was a lie
    // about half the chart. The tooltip gets the per-series map for the same
    // reason.
    const leftUnit =
      s.find((x) => axisOf(x.key) === "l")?.unit ??
      s[0].unit;
    const rightUnit =
      s.find((x) => axisOf(x.key) === "r")?.unit ?? "";
    const headerUnit =
      dual && rightUnit && rightUnit !== leftUnit
        ? `${leftUnit} · ${rightUnit}`
        : s[0].unit;
    const tipUnits = dual
      ? ` units={${JSON.stringify(Object.fromEntries(s.map((x) => [x.key, x.unit])))}}`
      : "";

    const queries = fan
      ? [
          {
            dataset: s[0].dataset,
            // A subset chip filters at the server: nine hubs' rows, not
            // 1,118 nodes' rows thinned after delivery.
            ...(fan.only ? { node: fan.only } : {}),
            start: o.window,
            limit,
          },
        ]
      : s.map((x) => ({
          dataset: x.dataset,
          node: x.node,
          start: o.window,
          limit,
        }));

    const setup = fan
      ? `
  const ENTITY = ${JSON.stringify(fan.key)};
  const OMIT = ${JSON.stringify(fan.omit)};
  const ONLY = ${JSON.stringify(fan.only ?? null)};
  const COLUMN = ${JSON.stringify(s[0].column)};

  /*
    Pivot: one point per interval, one key per entity, discovered from the
    rows rather than declared — an entity the source adds next year appears
    without this page being recomposed. color slots go by alphabetical
    entity name, so a reload never repaints anyone; past eight entities the
    eight largest keep the chart and the rest wait for a second tile.
  */
  const { merged, names } = React.useMemo(() => {
    const by = new Map();
    const size = new Map();
    (rows[0] || []).forEach((r) => {
      const e = r[ENTITY];
      if (e == null || OMIT.includes(e)) return;
      // The query already filters to ONLY; the guard keeps a row the filter
      // should have excluded from sneaking a series in.
      if (ONLY && !ONLY.includes(e)) return;
      const t = Date.parse(r.interval_start_utc);
      const at = by.get(t) || { t };
      at[e] = r[COLUMN];
      by.set(t, at);
      size.set(e, (size.get(e) || 0) + Math.abs(r[COLUMN] ?? 0));
    });
    let names = [...size.keys()].sort();
    if (names.length > 8) {
      const keep = new Set(
        [...size.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]),
      );
      names = names.filter((e) => keep.has(e));
    }
    return { merged: [...by.values()].sort((a, b) => a.t - b.t), names };
  }, [rows]);

  const SERIES = names.map((e, n) => ({ key: e, label: e, color: ${JSON.stringify(PALETTE)}[n % 8] }));`
      : `
  // One point per interval, every series on the same timestamp.
  const merged = React.useMemo(() => {
    const by = new Map();
    ${s
      .map(
        (x, n) => `(rows[${n}] || []).forEach((r) => {
      const t = Date.parse(r.interval_start_utc);
      const at = by.get(t) || { t };
      at.${x.key} = r.${x.column};
      by.set(t, at);
    });`,
      )
      .join("\n    ")}
    const sorted = [...by.values()].sort((a, b) => a.t - b.t);${slowFill(refs, s)}${
      spread
        ? `
    // The question is the difference; the sides stay hoverable via the join.
    for (const row of sorted) {
      row.sd = row.s0 != null && row.s1 != null ? row.s0 - row.s1 : undefined;
    }`
        : ""
    }
    return sorted;
  }, [rows]);
${
  stacked
    ? `
  const SERIES = ${JSON.stringify(
    // A stack has no stroke of its own — the hairline between segments is the
    // surface color — so a stacked series takes the color and ignores the
    // line style rather than drawing a dash nobody asked for.
    s.map((x, n) => ({
      key: x.key,
      label: x.label,
      color: paint(styles, x.key, n).color,
    })),
  )};`
    : ""
}`;

    // Stack order is decided from the data: the biggest series goes to the
    // bottom. colors ride with the series, never with the position.
    const orderMemo =
      stacked || fan
        ? `
  const ordered = React.useMemo(() => {
    if (!${JSON.stringify(stacked)} || ${JSON.stringify(o.order)} !== "size" || !merged.length) return SERIES;
    const mean = (k) => merged.reduce((a, r) => a + (r[k] ?? 0), 0) / merged.length;
    return [...SERIES].sort((a, b) => mean(b.key) - mean(a.key));
  }, [merged, SERIES]);
`
        : "";

    const marks =
      stacked || fan
        ? stacked
          ? // The surface-colored stroke is the gap between stacked
            // segments, so adjacent fills never touch — identity is never
            // color alone.
            `{ordered.map((sr) => (
            <Area key={sr.key} type="monotone" stackId="a" dataKey={sr.key} name={sr.label} stroke="var(--surface)" strokeWidth={1} fill={sr.color} fillOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
          ))}`
          : `{ordered.map((sr) => (
            <${area ? "Area" : "Line"} key={sr.key} type="monotone" dataKey={sr.key} name={sr.label} stroke={sr.color} ${area ? "fill={sr.color} fillOpacity={0.12} " : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
          ))}`
        : spread
          ? // One line, drawn as the first series was told to draw: the spread
            // is a question about A against B, and A is the one it follows.
            (() => {
              const p = paint(styles, "s0", 0);
              return `<${area ? "Area" : "Line"} type="monotone" dataKey="sd" name=${JSON.stringify(title)} stroke="${p.color}" ${dashProp(p.dash)}${area ? `fill="${p.color}" fillOpacity={0.12} ` : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`;
            })()
          : s
              .map((x, n) => {
                const p = paint(styles, x.key, n);
                // A wired chart's series is whatever was picked, so its label
                // follows the pick — a legend reading the composed-in node
                // beside the picked node's line compares nothing.
                const label =
                  follow !== null
                    ? `{picked ?? ${JSON.stringify(x.label)}}`
                    : JSON.stringify(x.label);
                return `<${area ? "Area" : "Line"} type="monotone" dataKey="${x.key}" name=${label} ${dual ? `yAxisId="${axisOf(x.key)}" ` : ""}stroke="${p.color}" ${dashProp(p.dash)}${area ? `fill="${p.color}" fillOpacity={0.12} ` : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`;
              })
              .join("\n          ");

    return {
      imports: [
        Wrap,
        stacked || area ? "Area" : "Line",
        "XAxis",
        "YAxis",
        "CartesianGrid",
        "Tooltip",
        "ResponsiveContainer",
        "ReferenceLine",
        ...(legend ? ["Legend"] : []),
      ],
      code: `function ${name}({ w, h }) {
  const SOURCE_TZ = ${JSON.stringify(sourceTz(refs))};
${followSnippet(follow, JSON.stringify(queries, null, 2).replace(/\n/g, "\n      "))}
  const { rows, error, loading } = useSeries(queries, ${refreshMs(refs)});
${setup}
${orderMemo}
  /*
    Evenly spaced clock ticks, generated from the domain rather than left to
    the data. Recharts picks its labels from the rows it has, so a collection
    gap pulled the labels with it — equal distances on screen stopped meaning
    equal durations, and the gap itself became unreadable. A time axis is a
    ruler, aligned to round times in the display timezone so labels land on
    whole hours and days as the reader counts them.

    The step is the finest one the tile has room for — a wide tile on a day
    window labels every hour, and narrowing it degrades through 2h/3h/4h
    rather than thinning arbitrarily. Room is the measured width of the plot
    box at ~48px a label ("00:00" plus breathing space), so a resize redraws
    the scale live; before the first measurement it assumes seven, the old
    fixed budget.

    Every tick shows its hour; the date sits on a second line beneath the
    ticks where the day changes (rendered by TimeTick), so time is never
    displaced by its own context. A daily step is dates only — every hour
    would read 00:00. The axis is given the second line's height only when
    some tick actually uses it.
  */
  const tz = useTz(SOURCE_TZ);
  const plotBox = React.useRef(null);
  const [plotW, setPlotW] = React.useState(0);
  React.useEffect(() => {
    const el = plotBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlotW(el.clientWidth));
    ro.observe(el);
    setPlotW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const { ticks: TICKS, labels: TICKLABELS, tall: TICKTALL } = React.useMemo(() => {
    if (merged.length < 2) return { ticks: undefined, labels: null, tall: false };
    const lo = merged[0].t, hi = merged[merged.length - 1].t;
    const HOUR = 3600000, DAY = 86400000;
    const steps = [15 * 60000, 30 * 60000, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY];
    const fit = plotW > 0 ? Math.max(4, Math.floor(plotW / 48)) : 7;
    const step = steps.find((x) => (hi - lo) / x <= fit) || 2 * DAY;
    // Daily ticks land on the display zone's own midnights; sub-daily steps
    // stay epoch-aligned, which is hour-aligned for every whole-hour zone.
    const off = step >= DAY ? tzOffsetMs(lo, tz) : 0;
    const ticks = [];
    const labels = new Map();
    let lastDay = null;
    let tall = false;
    for (let t = Math.ceil((lo + off) / step) * step - off; t <= hi; t += step) {
      if (t < lo) continue;
      ticks.push(t);
      const day = tzDayKey(t, tz);
      const sub = step < DAY && day !== lastDay ? tzDate(t, tz) : null;
      labels.set(
        t,
        step >= DAY ? { top: tzDate(t, tz), sub: null } : { top: tzTime(t, tz), sub },
      );
      if (sub) tall = true;
      lastDay = day;
    }
    return { ticks, labels, tall };
  }, [merged, plotW, tz]);
  return (
    <Section index={${i}} w={w} h={h} fill title=${
      follow !== null
        ? `{picked ? picked + ${JSON.stringify(
            ` — ${schemaFor(refs[0]?.schemaId)?.name ?? ""}`,
          )} : ${JSON.stringify(title)}}`
        : JSON.stringify(title)
    } unit=${JSON.stringify(headerUnit)} loading={loading} error={error}>
${mockTag(anyMock)}      <div ref={plotBox} style={{ inset: 0, position: "absolute" }}>
      <ResponsiveContainer width="100%" height="100%">
        <${Wrap} data={merged} margin={{ top: 4, right: ${dual ? -12 : 8}, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          {/* interval 0 renders every tick handed to it: the step was already
              sized to the room, and recharts's own collision guess re-thinned
              an hourly scale unevenly — 3h, 3h, 2h — which is worse than
              either density. */}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={TICKS}
            interval={0}
            tick={<TimeTick labels={TICKLABELS} tz={tz} />}
            height={TICKTALL ? 34 : 30}
            stroke="var(--line)"
            tickLine={false}
          />
${
  dual
    ? `          <YAxis yAxisId="l" tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={52} />
          <YAxis yAxisId="r" orientation="right" tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={52} />
          <ReferenceLine yAxisId="l" y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />`
    : `          <YAxis tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={52} />
          <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />`
}
          <Tooltip content={<ChartTip unit=${JSON.stringify(leftUnit)}${tipUnits} tz={tz} />} />
${
  legend
    ? `          {!NAKED && <Legend wrapperStyle={{ fontSize: 10.5, color: "var(--muted)" }} iconSize={9} />}
          `
    : "          "
}${marks}
        </${Wrap}>
      </ResponsiveContainer>
      </div>
    </Section>
  );
}`,
    };
  },
};

/**
 * Two series against each other, with time as the thing that pairs them.
 *
 * The one question none of the other shapes can ask. Everything else here puts
 * time on the x-axis and answers "what happened"; this answers "how do these
 * two move together" — load against price, wind against price, day-ahead
 * against real-time. It is the second chart any analyst reaches for and the
 * first one they reach for when a line chart has already shown them a shape
 * they cannot explain.
 *
 * The fit is the point of the tile, not decoration: a cloud of dots with no
 * summary is an invitation to see whatever you came to see. `r` is stated in
 * the header, so a weak relationship says so in a number rather than being
 * argued about from the picture.
 */
const scatter: ComponentDef = {
  kind: "scatter",
  name: "Scatter",
  blurb:
    "Two series against each other — how they move together.",
  options: [
    {
      key: "window",
      label: "Window",
      choices: WINDOWS,
      fallback: "-24h",
    },
    {
      key: "fit",
      label: "Fit",
      choices: [
        { value: "linear", label: "Trend line" },
        { value: "none", label: "None" },
      ],
      fallback: "linear",
    },
  ],
  // Exactly two: an x and a y. A third series has no axis left to sit on, and
  // one has nothing to be plotted against.
  accepts: (refs) =>
    refs.length === 2 &&
    !fanoutOf(refs[0]) &&
    !fanoutOf(refs[1])
      ? { ok: true }
      : {
          ok: false,
          why: "Pick exactly two series — the first is the x-axis, the second the y.",
        },
  // Beside anything else it is not a rejected scatter, it is the wrong question.
  offered: (refs) => refs.length === 2,
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Scatter${i}`;
    const styles = readSeries(o);
    const dot = paint(styles, "s1", 1).color;
    const limit = o.window === "-7d" ? 2000 : 500;
    const queries = s.map((x) => ({
      dataset: x.dataset,
      node: x.node,
      start: o.window,
      limit,
    }));

    return {
      imports: [
        "ScatterChart",
        "Scatter",
        "XAxis",
        "YAxis",
        "ZAxis",
        "CartesianGrid",
        "Tooltip",
        "ResponsiveContainer",
        ...(o.fit === "linear" ? ["ReferenceLine"] : []),
      ],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(queries, null, 2).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );

  /*
    A point is one interval that both series reported. Intervals only one of
    them covers are dropped rather than filled: a fabricated pair would be a
    dot in the cloud that nothing measured.
  */
  const { points, fit, r } = React.useMemo(() => {
    const by = new Map();
    (rows[0] || []).forEach((row) => {
      by.set(Date.parse(row.interval_start_utc), { x: row.${s[0].column} });
    });
    (rows[1] || []).forEach((row) => {
      const at = by.get(Date.parse(row.interval_start_utc));
      if (at) at.y = row.${s[1].column};
    });
    const points = [...by.entries()]
      .map(([t, p]) => ({ t, x: p.x, y: p.y }))
      .filter((p) => p.x != null && p.y != null);

    const n = points.length;
    if (n < 3) return { points, fit: null, r: null };
    const sx = points.reduce((a, p) => a + p.x, 0);
    const sy = points.reduce((a, p) => a + p.y, 0);
    const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
    const syy = points.reduce((a, p) => a + p.y * p.y, 0);
    const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
    const varX = n * sxx - sx * sx;
    const varY = n * syy - sy * sy;
    if (varX === 0 || varY === 0) return { points, fit: null, r: null };
    const slope = (n * sxy - sx * sy) / varX;
    const intercept = (sy - slope * sx) / n;
    const xs = points.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return {
      points,
      fit: [
        { x: lo, y: slope * lo + intercept },
        { x: hi, y: slope * hi + intercept },
      ],
      r: (n * sxy - sx * sy) / Math.sqrt(varX * varY),
    };
  }, [rows]);

  const tz = useTz(${JSON.stringify(sourceTz(refs))});

  function ScatterTip({ active, payload }) {
    // The point being read, for the double click that asks about it
    // (askPayload). The clear is owned — see ChartTip for why.
    const me = React.useRef(0);
    if (!me.current) me.current = ++SERIES_SEQ;
    if (!active || !payload || !payload.length) {
      if (window.__dryosHover && window.__dryosHover.owner === me.current) window.__dryosHover = null;
      return null;
    }
    const p = payload[0].payload;
    window.__dryosHover = {
      owner: me.current,
      when: new Date(p.t).toISOString(),
      label: tzTime(p.t, tz) + " " + tzShort(p.t, tz),
      values: [
        { name: ${JSON.stringify(s[0].label)}, value: p.x, unit: ${JSON.stringify(s[0].unit)} },
        { name: ${JSON.stringify(s[1].label)}, value: p.y, unit: ${JSON.stringify(s[1].unit)} },
      ],
    };
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, padding: "6px 9px" }}>
        <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
          {tzTime(p.t, tz)} {tzShort(p.t, tz)}
        </div>
        <div style={{ color: "var(--ink)" }}>${s[0].label.replace(/"/g, "")}: <strong>{Number(p.x).toFixed(2)}</strong> ${s[0].unit}</div>
        <div style={{ color: "var(--ink)" }}>${s[1].label.replace(/"/g, "")}: <strong>{Number(p.y).toFixed(2)}</strong> ${s[1].unit}</div>
      </div>
    );
  }

  return (
    <Section index={${i}} w={w} h={h} fill title=${JSON.stringify(`${s[1].label} vs ${s[0].label}`)} unit={r == null ? "" : "r " + r.toFixed(2)} loading={loading} error={error}>
${mockTag(anyMock)}      <div style={{ inset: 0, position: "absolute" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="var(--line)" />
          {/*
            Numbers only, one decimal. A price axis at full precision reads
            "26.355" five times across the bottom, and repeating the unit on
            every tick spends the width the cloud needs — the tooltip carries
            both, and the header carries the pair being compared.
          */}
          <XAxis
            type="number"
            dataKey="x"
            name=${JSON.stringify(s[0].label)}
            domain={["dataMin", "dataMax"]}
            tickFormatter={axisNum}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            name=${JSON.stringify(s[1].label)}
            domain={["dataMin", "dataMax"]}
            tickFormatter={axisNum}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
            width={46}
          />
          <ZAxis range={[16, 16]} />
          <Tooltip content={<ScatterTip />} cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
${
  o.fit === "linear"
    ? `          {fit && (
            <ReferenceLine
              segment={fit}
              stroke="var(--line-strong)"
              strokeWidth={1.4}
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
            />
          )}
`
    : ""
}          <Scatter data={points} fill="${dot}" fillOpacity={0.62} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      </div>
    </Section>
  );
}`,
    };
  },
};

/**
 * How often, not when.
 *
 * A line chart answers "what did the price do"; neither it nor a heatmap
 * answers "how often is it above $100", which is the question a hedge, a
 * battery dispatch or a budget is actually built on. Two views of the same
 * arithmetic:
 *
 *   · **Duration curve** — every reading sorted highest to lowest against the
 *     share of the window it holds. The standard artifact in power: read across
 *     at a price to get the percentage of hours above it. Several series
 *     overlay cleanly, because each is its own sorted line.
 *   · **Histogram** — the same values in buckets. One series draws bars; more
 *     than one draws frequency polygons, because overlaid bars at this size are
 *     a wall nobody can read through.
 */
const distribution: ComponentDef = {
  kind: "distribution",
  name: "Distribution",
  blurb:
    "How often a value occurs — duration curve or histogram.",
  options: [
    {
      key: "window",
      label: "Window",
      choices: WINDOWS,
      fallback: "-24h",
    },
    {
      key: "view",
      label: "View",
      choices: [
        { value: "duration", label: "Duration curve" },
        { value: "histogram", label: "Histogram" },
      ],
      fallback: "duration",
    },
    {
      key: "bins",
      label: "Buckets",
      choices: [
        { value: "20", label: "20" },
        { value: "40", label: "40" },
      ],
      fallback: "20",
    },
  ],
  // Bucketing mixes nothing: two units in one distribution is two distributions
  // drawn on top of each other.
  accepts: (refs) =>
    refs.length === 0
      ? { ok: false, why: "Pick a series." }
      : refs.length > 4
        ? {
            ok: false,
            why: "Four distributions is the most one axis reads.",
          }
        : refs.length === 1 && fanoutOf(refs[0])
          ? {
              ok: false,
              why: "A whole stream fans out to more curves than this reads — pick the entities.",
            }
          : uniformUnit(refs) === null
            ? {
                ok: false,
                why: "One unit at a time: these mix units.",
              }
            : { ok: true },
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Distribution${i}`;
    const styles = readSeries(o);
    const duration = o.view !== "histogram";
    // Bars only for a single series; anything more overlays as outlines.
    const bars = !duration && s.length === 1;
    const limit = o.window === "-7d" ? 2000 : 500;
    const queries = s.map((x) => ({
      dataset: x.dataset,
      node: x.node,
      start: o.window,
      limit,
    }));
    const marks = s
      .map((x, n) => {
        const p = paint(styles, x.key, n);
        return duration
          ? `<Line type="monotone" dataKey="${x.key}" name=${JSON.stringify(x.label)} stroke="${p.color}" ${dashProp(p.dash)}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`
          : bars
            ? `<Bar dataKey="${x.key}" name=${JSON.stringify(x.label)} fill="${p.color}" fillOpacity={0.8} isAnimationActive={false} />`
            : `<Line type="monotone" dataKey="${x.key}" name=${JSON.stringify(x.label)} stroke="${p.color}" ${dashProp(p.dash)}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`;
      })
      .join("\n          ");

    const columns = JSON.stringify(
      s.map((x) => ({ key: x.key, column: x.column })),
    );

    return {
      imports: [
        duration || !bars ? "LineChart" : "BarChart",
        duration || !bars ? "Line" : "Bar",
        "XAxis",
        "YAxis",
        "CartesianGrid",
        "Tooltip",
        "ResponsiveContainer",
        ...(s.length > 1 ? ["Legend"] : []),
      ],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(queries, null, 2).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );

  const SERIES = ${columns};
  const DURATION = ${JSON.stringify(duration)};
  const BINS = ${Number(o.bins) || 20};

  const data = React.useMemo(() => {
    const values = SERIES.map((sr, n) =>
      (rows[n] || []).map((r) => r[sr.column]).filter((v) => v != null),
    );
    if (!values.some((v) => v.length)) return [];

    if (DURATION) {
      /*
        One point per percentile, not per reading: a week of five-minute data
        is two thousand dots that draw as a solid band. A hundred steps is the
        same curve at the resolution anybody reads it at.
      */
      const sorted = values.map((v) => [...v].sort((a, b) => b - a));
      const out = [];
      for (let p = 0; p <= 100; p++) {
        const at = { p };
        sorted.forEach((v, n) => {
          if (!v.length) return;
          at[SERIES[n].key] = v[Math.min(v.length - 1, Math.round((p / 100) * (v.length - 1)))];
        });
        out.push(at);
      }
      return out;
    }

    // One set of buckets across every series, or the bars would not line up.
    const all = values.flat();
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const step = (hi - lo) / BINS || 1;
    const out = [];
    for (let b = 0; b < BINS; b++) {
      const at = { bucket: lo + step * (b + 0.5) };
      SERIES.forEach((sr) => (at[sr.key] = 0));
      out.push(at);
    }
    values.forEach((v, n) => {
      v.forEach((x) => {
        const b = Math.min(BINS - 1, Math.max(0, Math.floor((x - lo) / step)));
        out[b][SERIES[n].key] += 1;
      });
    });
    return out;
  }, [rows]);

  function DistTip({ active, payload, label }) {
    // The bin being read, for the double click that asks about it
    // (askPayload). The clear is owned — see ChartTip for why.
    const me = React.useRef(0);
    if (!me.current) me.current = ++SERIES_SEQ;
    if (!active || !payload || !payload.length) {
      if (window.__dryosHover && window.__dryosHover.owner === me.current) window.__dryosHover = null;
      return null;
    }
    window.__dryosHover = {
      owner: me.current,
      when: null,
      label: DURATION ? label + "% of the window at or above" : "around " + Number(label).toFixed(1) + " ${s[0].unit}",
      values: payload.map((p) => ({ name: p.name, value: p.value, unit: DURATION ? "${s[0].unit}" : "readings" })),
    };
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, padding: "6px 9px" }}>
        <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
          {DURATION ? label + "% of the window at or above" : "around " + Number(label).toFixed(1) + " ${s[0].unit}"}
        </div>
        {payload.map((p) => (
          <div key={p.dataKey} style={{ color: "var(--ink)" }}>
            <span style={{ color: p.stroke && p.stroke !== "var(--surface)" ? p.stroke : p.fill }}>■ </span>
            {p.name}: <strong>{p.value == null ? "—" : Number(p.value).toFixed(DURATION ? 2 : 0)}</strong> {DURATION ? "${s[0].unit}" : "readings"}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Section index={${i}} w={w} h={h} fill title=${JSON.stringify(titleFor(refs, s))} unit=${JSON.stringify(duration ? s[0].unit : "readings")} loading={loading} error={error}>
${mockTag(anyMock)}      <div style={{ inset: 0, position: "absolute" }}>
      <ResponsiveContainer width="100%" height="100%">
        <${duration || !bars ? "LineChart" : "BarChart"} data={data} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey=${duration ? '"p"' : '"bucket"'}
            type="number"
            domain={${duration ? "[0, 100]" : '["dataMin", "dataMax"]'}}
            tickFormatter={${duration ? '(v) => v + "%"' : "(v) => Number(v).toFixed(0)"}}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
          />
          <YAxis tickFormatter={axisNum} tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={46} />
          <Tooltip content={<DistTip />} />
${s.length > 1 ? '          {!NAKED && <Legend wrapperStyle={{ fontSize: 10.5, color: "var(--muted)" }} iconSize={9} />}\n' : ""}          ${marks}
        </${duration || !bars ? "LineChart" : "BarChart"}>
      </ResponsiveContainer>
      </div>
    </Section>
  );
}`,
    };
  },
};

const bar: ComponentDef = {
  kind: "bar",
  name: "Bar",
  blurb: "The latest value of each series, side by side.",
  options: [
    {
      key: "sort",
      label: "Order",
      choices: [
        { value: "size", label: "Largest first" },
        { value: "selection", label: "As selected" },
        { value: "az", label: "A to Z" },
      ],
      fallback: "size",
    },
    {
      key: "orient",
      label: "Bars",
      choices: [
        { value: "v", label: "Columns" },
        { value: "h", label: "Rows" },
      ],
      fallback: "v",
    },
  ],
  accepts: (refs) =>
    refs.length === 0
      ? { ok: false, why: "Pick some series." }
      : refs.length === 1 && !fanoutOf(refs[0])
        ? {
            ok: false,
            why: "One value is a ticker — add a second series to compare.",
          }
        : refs.length > 8
          ? {
              ok: false,
              why: "Eight bars is the most one chart compares well.",
            }
          : uniformUnit(refs) === null
            ? {
                ok: false,
                why: "Bars compare one unit; these mix units.",
              }
            : { ok: true },
  // Beside a single selection a bar is not a rejected bar, it is a ticker —
  // unless the selection is a whole stream, which fans out into a bar per
  // entity and is exactly what this shape is for.
  offered: (refs) =>
    refs.length !== 1 || fanoutOf(refs[0]) !== null,
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Bar${i}`;
    const fan =
      refs.length === 1 ? fanoutOf(refs[0]) : null;
    const title = fan
      ? refs[0].subset
        ? refs[0].label
        : (schemaFor(refs[0].schemaId)?.name ?? s[0].label)
      : titleFor(refs, s);
    const horizontal = o.orient === "h";

    const queries = fan
      ? // Two intervals' worth of rows covers every entity even when the
        // newest interval is still filling in. A subset filters at the server
        // and sizes the fetch to its own count.
        [
          {
            dataset: s[0].dataset,
            ...(fan.only ? { node: fan.only } : {}),
            limit: fan.only
              ? Math.max(24, fan.only.length * 2)
              : 24,
          },
        ]
      : s.map((x) => ({
          dataset: x.dataset,
          node: x.node,
          limit: 1,
        }));

    const dataMemo = fan
      ? `
  const ENTITY = ${JSON.stringify(fan.key)};
  const OMIT = ${JSON.stringify(fan.omit)};
  const ONLY = ${JSON.stringify(fan.only ?? null)};
  const COLUMN = ${JSON.stringify(s[0].column)};

  // Rows arrive newest-first, so the first row per entity is its latest
  // value. color slots go by alphabetical entity name — stable across
  // reloads and untouched by the sort below.
  const data = React.useMemo(() => {
    const latest = new Map();
    (rows[0] || []).forEach((r) => {
      const e = r[ENTITY];
      if (e == null || OMIT.includes(e) || latest.has(e)) return;
      if (ONLY && !ONLY.includes(e)) return;
      latest.set(e, r[COLUMN]);
    });
    const names = [...latest.keys()].sort();
    const out = names
      .map((e, n) => ({
        name: e,
        full: e,
        fill: ${JSON.stringify(PALETTE)}[n % 8],
        v: latest.get(e),
      }))
      .filter((d) => d.v != null)
      .slice(0, 8);
    if (${JSON.stringify(o.sort)} === "size") out.sort((a, b) => b.v - a.v);
    return out;
  }, [rows]);`
      : `
  // The entity is the bar's name; color was assigned at selection time and
  // rides with the entity through any sort, never with its rank.
  const SERIES = ${JSON.stringify(
    s.map((x, n) => ({
      name: x.node || x.label,
      full: x.label,
      column: x.column,
      color: paint(readSeries(o), x.key, n).color,
    })),
  )};

  const data = React.useMemo(() => {
    const out = SERIES.map((sr, n) => ({
      name: sr.name,
      full: sr.full,
      fill: sr.color,
      v: rows[n] && rows[n][0] ? rows[n][0][sr.column] : null,
    })).filter((d) => d.v != null);
    if (${JSON.stringify(o.sort)} === "size") out.sort((a, b) => b.v - a.v);
    if (${JSON.stringify(o.sort)} === "az") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows]);`;

    return {
      imports: [
        "BarChart",
        "Bar",
        "Cell",
        "XAxis",
        "YAxis",
        "CartesianGrid",
        "Tooltip",
        "ResponsiveContainer",
      ],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(queries, null, 2).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );
${dataMemo}

  function BarTip({ active, payload }) {
    // The bar being read, for the double click that asks about it
    // (askPayload). The clear is owned — see ChartTip for why.
    const me = React.useRef(0);
    if (!me.current) me.current = ++SERIES_SEQ;
    if (!active || !payload || !payload.length) {
      if (window.__dryosHover && window.__dryosHover.owner === me.current) window.__dryosHover = null;
      return null;
    }
    const d = payload[0].payload;
    window.__dryosHover = { owner: me.current, when: null, label: d.full, values: [{ name: d.full, value: d.v, unit: ${JSON.stringify(s[0].unit)} }] };
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, padding: "6px 9px" }}>
        <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>{d.full}</div>
        <div style={{ color: "var(--ink)" }}>
          <span style={{ color: d.fill }}>■ </span>
          <strong>{Number(d.v).toFixed(2)}</strong> ${s[0].unit}
        </div>
      </div>
    );
  }

  return (
    <Section index={${i}} w={w} h={h} fill title=${JSON.stringify(title)} unit=${JSON.stringify(s[0].unit)} loading={loading} error={error}>
${mockTag(anyMock)}      <div style={{ inset: 0, position: "absolute" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} ${horizontal ? 'layout="vertical" ' : ""}margin={{ top: 4, right: 8, bottom: 0, left: ${horizontal ? 4 : -12} }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--line)" ${horizontal ? "horizontal={false}" : "vertical={false}"} />
${
  horizontal
    ? `          <XAxis type="number" tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fill: "var(--faint)", fontSize: 10.5 }} stroke="var(--line)" tickLine={false} />`
    : `          <XAxis dataKey="name" tick={{ fill: "var(--faint)", fontSize: 10.5 }} stroke="var(--line)" tickLine={false} interval={0} />
          <YAxis tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={52} />`
}
          <Tooltip content={<BarTip />} cursor={{ fill: "var(--line)", fillOpacity: 0.25 }} />
          <Bar dataKey="v" radius={${horizontal ? "[0, 3, 3, 0]" : "[3, 3, 0, 0]"}} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </Section>
  );
}`,
    };
  },
};

const heatmap: ComponentDef = {
  kind: "heatmap",
  name: "Heatmap",
  blurb:
    "Time gridded against itself — where in the day, or where in the hour, a series lives.",
  options: [
    {
      /*
        Which grid, and the honest default is "whichever the data is".

        A heatmap's whole claim is that a cell is one reading, so the grid has
        to be the shape of the readings. Five-minute prices gridded hour by day
        average twelve SCED runs into one square and hide exactly the spikes
        somebody opened a heatmap to find; day-ahead hourly prices gridded the
        same way are one reading per cell and read perfectly. So the axes follow
        the granularity, and the setting is here for the times you want the other
        reading of the same series.
      */
      key: "grid",
      label: "Grid",
      choices: [
        { value: "auto", label: "Match the data" },
        { value: "day", label: "Day × hour" },
        { value: "hour", label: "Hour × interval" },
      ],
      fallback: "auto",
    },
    {
      // "Match the grid", because a day of hours and a month of days are the
      // same amount of grid, and neither default is right for the other.
      key: "span",
      label: "Span",
      choices: [
        { value: "auto", label: "Match the grid" },
        { value: "-12h", label: "12 hours" },
        { value: "-24h", label: "24 hours" },
        { value: "-2d", label: "2 days" },
        { value: "-7d", label: "7 days" },
        { value: "-14d", label: "14 days" },
        { value: "-30d", label: "30 days" },
      ],
      fallback: "auto",
    },
    {
      key: "agg",
      label: "Cell",
      choices: [
        { value: "avg", label: "Average" },
        { value: "max", label: "Peak" },
      ],
      fallback: "avg",
    },
  ],
  accepts: (refs) =>
    refs.length === 0
      ? { ok: false, why: "Pick a series." }
      : refs.length > 1
        ? {
            ok: false,
            why: "A heatmap grids one series against time.",
          }
        : fanoutOf(refs[0])
          ? {
              ok: false,
              why: "Pick a single entity, not the whole stream.",
            }
          : // Grain, not cadence: the day-ahead market publishes once a day and
            // is still twenty-four hourly readings, which is a grid.
            grainOf(refs[0]) > 3600
            ? {
                ok: false,
                why: "Needs intraday readings — a daily series has no hours to grid.",
              }
            : { ok: true },
  // Beside several series a heatmap is not a rejected heatmap; the selection
  // has simply moved past it, the same way it moves past the ticker.
  offered: (refs) => refs.length <= 1,
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Heatmap${i}`;
    const grain = grainOf(refs[0]);
    /*
      The one decision everything below is derived from. Left to itself it
      follows the data: several readings inside an hour make the hour worth a
      row of its own, one reading an hour does not.

      Asked for hour rows by an hourly series it gives day rows anyway — one
      column is not a grid — rather than refusing a shape that renders
      perfectly well, which is how `combine: spread` treats a selection that
      is not two series.
    */
    const asked: "hour" | "day" =
      o.grid === "auto"
        ? grain < 3600
          ? "hour"
          : "day"
        : o.grid === "hour"
          ? "hour"
          : "day";
    const mode: "hour" | "day" =
      asked === "hour" && grain >= 3600 ? "day" : asked;
    const cellSeconds = mode === "hour" ? grain : 3600;
    const rowSeconds = mode === "hour" ? 3600 : 86_400;
    // Twelve five-minute slots in an hour, twenty-four hours in a day: one
    // expression, because the grid is always a row divided by its cell.
    const cols = Math.max(
      1,
      Math.round(rowSeconds / cellSeconds),
    );
    // Half a day of hours and a fortnight of days are about the same amount of
    // grid, and both land inside a tile at its arriving size rather than
    // scrolling half of themselves out of sight.
    const span =
      o.span === "auto"
        ? mode === "hour"
          ? "-12h"
          : "-14d"
        : o.span;
    const spanSeconds = SPAN_SECONDS[span] ?? 1_209_600;
    /*
      Rows, not publishes: a fortnight of the day-ahead market is 336 hourly
      rows behind a daily cadence, and asking for 14 drew two days of grid and
      called it a fortnight. The headroom is for the forward-looking reports,
      whose newest rows are in the future — the query has a start and no end, so
      tomorrow's prices arrive first and would otherwise eat into the window.
    */
    const limit = Math.min(
      10_000,
      Math.ceil(spanSeconds / Math.max(grain, 60)) + 48,
    );
    // The most rows the span can hold, plus the two partials at either edge.
    const maxRows = Math.ceil(spanSeconds / rowSeconds) + 2;
    const cellLabel =
      mode === "day"
        ? "hour"
        : cellSeconds % 60 === 0
          ? `${cellSeconds / 60} minutes`
          : `${cellSeconds} seconds`;

    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    [{ dataset: ${JSON.stringify(s[0].dataset)}, node: ${JSON.stringify(s[0].node)}, start: "${span}", limit: ${limit} }],
    ${refreshMs(refs)},
  );

  const COLUMN = ${JSON.stringify(s[0].column)};
  const UNIT = ${JSON.stringify(s[0].unit)};
  const AGG = ${JSON.stringify(o.agg)};
  const SOURCE_TZ = ${JSON.stringify(sourceTz(refs))};
  /*
    The grid, decided from the granularity of the data when the page was
    composed. "day" is a row per day and a column per hour; "hour" is a row per
    hour and a column per interval within it — twelve for a five-minute feed —
    so a cell is always exactly one reading rather than an average of however
    many happened to land in an hour.
  */
  const MODE = ${JSON.stringify(mode)};
  const CELL_SECONDS = ${cellSeconds};
  const COLS = Array.from({ length: ${cols} }, (_, n) => n);
  const MAX_ROWS = ${maxRows};

  const pad2 = (n) => String(n).padStart(2, "0");

  /*
    Bucketed in the display timezone, because "hour of day" is a claim about a
    clock somebody keeps — by default the source's own (US Central for ERCOT:
    when Texans were using power, not when UTC says so), and the navbar's
    choice otherwise. Intl does the DST arithmetic. The zone is a real input
    to the grid, not a relabel: change it and the buckets themselves move.
  */
  const tz = useTz(SOURCE_TZ);
  const grid = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const cells = new Map();
    (rows[0] || []).forEach((r) => {
      const v = r[COLUMN];
      if (typeof v !== "number") return;
      const parts = fmt.formatToParts(new Date(r.interval_start_utc));
      const get = (t) => (parts.find((p) => p.type === t) || {}).value;
      const day = get("year") + "-" + get("month") + "-" + get("day");
      const hour = Number(get("hour")) % 24;
      // A row is a day or an hour; a column is an hour of that day or an
      // interval of that hour. SCED stamps its runs a few seconds past the
      // interval (:05:19), so the minute decides the slot, not the clock.
      const key = MODE === "hour" ? day + " " + pad2(hour) : day;
      const col =
        MODE === "hour"
          ? Math.min(COLS.length - 1, Math.floor((Number(get("minute")) * 60) / CELL_SECONDS))
          : hour;
      const d = cells.get(key) || {};
      const c = d[col] || { sum: 0, n: 0, max: -Infinity };
      c.sum += v; c.n += 1; c.max = Math.max(c.max, v);
      d[col] = c;
      cells.set(key, d);
    });
    const val = (c) => (AGG === "max" ? c.max : c.sum / c.n);
    // Newest first, and never more grid than the span asked for — the query
    // carries headroom for rows published ahead of now.
    const keys = [...cells.keys()].sort().reverse().slice(0, MAX_ROWS);
    let lo = Infinity, hi = -Infinity;
    keys.forEach((key) => {
      const d = cells.get(key);
      for (const cKey in d) { const x = val(d[cKey]); if (x < lo) lo = x; if (x > hi) hi = x; }
    });
    return { keys, cells, lo, hi, val };
  }, [rows, tz]);

  const [hover, setHover] = React.useState(null);

  /*
    A column is an hour or a clock minute, and only some of them are labelled:
    every third hour, every quarter of an hour. Enough to place a cell without
    a strip of numbers competing with the grid it labels.
  */
  const colLabel = (c) => (MODE === "day" ? String(c) : ":" + pad2(Math.round((c * CELL_SECONDS) / 60)));
  const colShown = (c) =>
    MODE === "day" ? c % 3 === 0 : ((c * CELL_SECONDS) / 60) % 15 === 0;
  // The date is only repeated when it changes: down a column of hours, every
  // row saying 08-30 is noise until the row where it stops being true.
  const rowLabel = (key, prev) =>
    MODE === "day"
      ? key.slice(5)
      : (prev && prev.slice(0, 10) === key.slice(0, 10) ? "" : key.slice(5, 10) + " ") +
        key.slice(11) + ":00";

  /*
    Ours, not the browser's. title= waits about a second before it appears,
    draws in the OS's colors — near-white on a dark grid — and can only say one
    flat line. On a chart whose whole point is "which hour", a hint you wait for
    and then squint at is not a hint.

    Delegated to the grid and updated only when the cell under the pointer
    changes, so 700 cells do not re-render at pointer rate. It anchors to the
    cell rather than trailing the cursor: the box is then already where the eye
    is, and it never sits on top of the cell it is describing.
  */
  const track = (e) => {
    const el = e.target.closest ? e.target.closest("[data-cell]") : null;
    if (!el) return setHover((prev) => (prev ? null : prev));
    const key = el.dataset.key;
    const col = Number(el.dataset.col);
    setHover((prev) => {
      if (prev && prev.key === key && prev.col === col) return prev;
      const r = el.getBoundingClientRect();
      return { key, col, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    });
  };

  const hc = hover ? (grid.cells.get(hover.key) || {})[hover.col] : null;
  // Minutes from midnight: the row supplies the hour in the hour grid, the
  // column supplies it in the day grid, and the cell's own length ends it.
  const startMin = !hover
    ? 0
    : MODE === "hour"
      ? Number(hover.key.slice(11)) * 60 + (hover.col * CELL_SECONDS) / 60
      : hover.col * 60;
  const clock = (m) => pad2(Math.floor(m / 60) % 24) + ":" + pad2(Math.round(m) % 60);
  // Prices want cents; load does not want four digits of them.
  const num = (v) =>
    Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);

  // The cell being read, for the click that asks about it (askPayload in the
  // runtime). An effect rather than an assignment in render, because the
  // readout is state here and the clear on leave is a state change too.
  React.useEffect(() => {
    window.__dryosHover = hover && hc
      ? {
          when: hover.key,
          label: clock(startMin) + " – " + clock(startMin + CELL_SECONDS / 60) + " CT, " + hover.key.slice(0, 10),
          values: [
            { name: AGG === "max" ? "peak" : "average", value: grid.val(hc), unit: UNIT },
            { name: "readings", value: hc.n, unit: "" },
          ],
        }
      : null;
  }, [hover, hc]);

  return (
    <Section index={${i}} w={w} h={h} title=${JSON.stringify(s[0].label)} unit={UNIT} loading={loading} error={error}>
${mockTag(anyMock)}      <div
        onMouseMove={track}
        onMouseLeave={() => setHover(null)}
        style={{ display: "grid", gap: 2, gridTemplateColumns: "auto repeat(" + COLS.length + ", 1fr)", fontFamily: "var(--mono)", fontSize: 9 }}
      >
        <span />
        {COLS.map((c) => (
          <span key={c} style={{ color: hover && hover.col === c ? "var(--ink)" : "var(--faint)", textAlign: "center" }}>
            {colShown(c) || (hover && hover.col === c) ? colLabel(c) : ""}
          </span>
        ))}
        {grid.keys.map((key, n) => (
          <React.Fragment key={key}>
            <span style={{ alignSelf: "center", color: hover && hover.key === key ? "var(--ink)" : "var(--faint)", paddingRight: 4, whiteSpace: "nowrap" }}>
              {rowLabel(key, grid.keys[n - 1])}
            </span>
            {COLS.map((c) => {
              const cell = (grid.cells.get(key) || {})[c];
              if (!cell) return <span key={c} style={{ background: "var(--surface-2)", borderRadius: 2, minHeight: 16 }} />;
              const x = grid.val(cell);
              const t = grid.hi > grid.lo ? (x - grid.lo) / (grid.hi - grid.lo) : 0.5;
              const on = hover && hover.key === key && hover.col === c;
              return (
                <span
                  key={c}
                  data-cell=""
                  data-key={key}
                  data-col={c}
                  style={{
                    background: "color-mix(in oklab, var(--surface-2), var(--s2) " + Math.round(8 + t * 88) + "%)",
                    borderRadius: 2,
                    minHeight: 16,
                    cursor: "crosshair",
                    // A ring, not a border: a border would resize the cell under
                    // the pointer and walk the whole grid out from under it.
                    boxShadow: on ? "0 0 0 1.5px var(--ink)" : undefined,
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {hover && hc ? (
        <div
          style={{
            /*
              Fixed: this frame's viewport is the tile, so the tooltip escapes
              the grid without needing a positioned ancestor, and clears a
              full-screen section (z-index 50) as well.
            */
            /*
              Placed by transform from the frame's top-left, not by left/top.
              A fixed box positioned near the right edge is shrink-wrapped into
              whatever space is left there, which wrapped every line of it into a
              column; laid out at the origin it takes its natural width first and
              is moved afterwards.

              Centred on the cell, then clamped to half of the capped width —
              measured clamping would cost a second render on every cell the
              pointer crosses, and the cap is what makes the arithmetic true
              rather than hopeful. Above the cell where there is room for it,
              below where there is not.
            */
            position: "fixed",
            left: 0,
            top: 0,
            transform:
              "translate(" +
              Math.min(Math.max(hover.x, 104), Math.max(104, window.innerWidth - 104)) +
              "px, " +
              (hover.top > 108 ? hover.top - 8 : hover.bottom + 8) +
              "px) translate(-50%, " +
              (hover.top > 108 ? "-100%" : "0") +
              ")",
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,.45)",
            maxWidth: 200,
            padding: "7px 10px",
            pointerEvents: "none",
            zIndex: 60,
          }}
        >
          <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em" }}>
            {clock(startMin)} – {clock(startMin + CELL_SECONDS / 60)} CT
          </div>
          <div style={{ color: "var(--ink)", fontSize: 17, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {num(grid.val(hc))}
            <span style={{ color: "var(--faint)", fontSize: 11, fontWeight: 400 }}> {UNIT}</span>
          </div>
          <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
            {new Date(hover.key.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
            {" · " + hc.n + (hc.n === 1 ? " reading" : " readings")}
            {/* The aggregate not on show above: a cell's peak is the question
                an average invites, and the reverse. One reading is both. */}
            {hc.n > 1 ? (AGG === "max" ? " · avg " + num(hc.sum / hc.n) : " · peak " + num(hc.max)) : ""}
          </div>
        </div>
      ) : null}
      <p style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9.5, margin: "6px 0 0" }}>
        {grid.lo === Infinity ? "no data yet" : grid.lo.toFixed(1) + " – " + grid.hi.toFixed(1) + " " + UNIT + " · " + (AGG === "max" ? "peak" : "average") + " per ${cellLabel} · Central time"}
      </p>
    </Section>
  );
}`,
    };
  },
};

const ticker: ComponentDef = {
  kind: "ticker",
  name: "Live ticker",
  blurb:
    "The newest value for each selection, with its move since the last interval.",
  options: [
    {
      key: "compare",
      label: "Compare to",
      choices: [
        { value: "prev", label: "Previous interval" },
        { value: "day", label: "24 hours ago" },
      ],
      fallback: "prev",
    },
  ],
  /*
    Exactly one. A ticker is a single number and its move; two of them side by
    side is a comparison, and a comparison is what the other three shapes are
    for. Keeping the rule here rather than only in the tray means the API
    refuses it too, so nothing can reach the generator in a shape it cannot
    draw.
  */
  accepts: (refs) =>
    refs.length === 1
      ? { ok: true }
      : {
          ok: false,
          why:
            refs.length === 0
              ? "Pick one series."
              : "A ticker shows one series.",
        },
  // The only shape a second selection rules out rather than merely strains, so
  // it is the only one that leaves the shelf instead of greying on it.
  offered: (refs) => refs.length <= 1,
  emit(refs, i, o) {
    const s = series(refs);
    const name = `Ticker${i}`;
    const day = o.compare === "day";
    const follow =
      refs.length === 1 && fanoutOf(refs[0])
        ? null
        : followOf(o);
    return {
      imports: [],
      code: `function ${name}({ w, h }) {
${followSnippet(
  follow,
  JSON.stringify(
    s.map((x) => ({
      dataset: x.dataset,
      node: x.node,
      start: "-2h",
      limit: 2,
    })),
    null,
    2,
  ).replace(/\n/g, "\n      "),
)}
  const { rows, error, loading } = useSeries(queries, ${refreshMs(refs)});

  const cells = ${JSON.stringify(
    s.map((x) => ({
      label: x.label,
      column: x.column,
      unit: x.unit,
      mock: x.mock,
    })),
  )}.map((c, n) => {
    const recent = rows[n] || [];
    const now = recent[0] ? recent[0][c.column] : null;
    const prev = ${day ? "recent[recent.length - 1]" : "recent[1]"} ? ${day ? "recent[recent.length - 1]" : "recent[1]"}[c.column] : null;
    return { ...c, now, delta: now != null && prev != null ? now - prev : null };
  });

  return (
    <Section index={${i}} w={w} h={h} title="Live" loading={loading} error={error}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {cells.map((c) => (
          <div key={c.label} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ alignItems: "center", display: "flex", gap: 5 }}>
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase" }}>{${
                follow !== null
                  ? "picked ?? c.label"
                  : "c.label"
              }}</span>
              {c.mock && (
                <span style={{ border: "1px dashed var(--info)", borderRadius: 3, color: "var(--info)", fontFamily: "var(--mono)", fontSize: 8.5, padding: "0 3px", textTransform: "uppercase" }}>mock</span>
              )}
            </div>
            <div style={{ color: "var(--ink)", fontSize: 22, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
              {c.now == null ? "—" : c.now.toFixed(2)}
              <span style={{ color: "var(--faint)", fontSize: 11, marginLeft: 4 }}>{c.unit}</span>
            </div>
            <div style={{ color: c.delta == null ? "var(--faint)" : c.delta >= 0 ? "var(--accent)" : "var(--info)", fontFamily: "var(--mono)", fontSize: 11, marginTop: 2 }}>
              {c.delta == null ? "no comparison" : (c.delta >= 0 ? "+" : "") + c.delta.toFixed(2) + ${JSON.stringify(day ? " vs 24h ago" : " since last")}}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}`,
    };
  },
};

const table: ComponentDef = {
  kind: "table",
  name: "Table",
  blurb: "The most recent intervals as rows, newest first.",
  options: [
    {
      key: "window",
      label: "Window",
      choices: WINDOWS,
      fallback: "-6h",
    },
    {
      key: "rows",
      label: "Rows",
      choices: [
        { value: "12", label: "12" },
        { value: "24", label: "24" },
        { value: "48", label: "48" },
      ],
      fallback: "24",
    },
  ],
  accepts: (refs) =>
    refs.length === 0
      ? { ok: false, why: "Pick a series." }
      : { ok: true },
  emit(refs, i, o) {
    const s = series(refs);
    const name = `Table${i}`;
    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(
      s.map((x) => ({
        dataset: x.dataset,
        node: x.node,
        start: "-6h",
        limit: 40,
      })),
      null,
      2,
    ).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );

  const cols = ${JSON.stringify(s.map((x) => ({ label: x.label, column: x.column, unit: x.unit })))};
  const tz = useTz(${JSON.stringify(sourceTz(refs))});
  const merged = React.useMemo(() => {
    const by = new Map();
    cols.forEach((c, n) => {
      (rows[n] || []).forEach((r) => {
        const t = r.interval_start_utc;
        const at = by.get(t) || { t };
        at["c" + n] = r[c.column];
        by.set(t, at);
      });
    });
    return [...by.values()].sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, ${Number(o.rows)});
  }, [rows]);

  return (
    <Section index={${i}} w={w} h={h} title="Recent intervals" loading={loading} error={error}>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              {/* The zone once, on the column, not per row: a table of times
                  each wearing "CST" is a table half made of the same word. */}
              <th>Interval ({tzShort(Date.now(), tz)})</th>
              {cols.map((c) => (
                <th key={c.label} style={{ textAlign: "right" }}>{c.label} {c.unit && "(" + c.unit + ")"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {merged.map((r) => (
              <tr key={r.t}>
                <td style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  {tzTime(Date.parse(r.t), tz)}
                </td>
                {cols.map((c, n) => (
                  <td key={c.label} style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {r["c" + n] == null ? "—" : Number(r["c" + n]).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}`,
    };
  },
};

const map: ComponentDef = {
  kind: "map",
  name: "Map",
  blurb:
    "Selections placed on Texas, sized and colored by their newest value.",
  options: [
    {
      key: "style",
      label: "Base map",
      choices: [
        { value: "auto", label: "Match theme" },
        { value: "dark-v11", label: "Dark" },
        { value: "light-v11", label: "Light" },
        {
          value: "satellite-streets-v12",
          label: "Satellite",
        },
      ],
      fallback: "auto",
    },
    {
      key: "trails",
      label: "Trails",
      choices: [
        { value: "on", label: "Show" },
        { value: "off", label: "Hide" },
      ],
      fallback: "on",
    },
    {
      key: "field",
      label: "Field",
      choices: [
        // Particles first because it is the right answer whenever it is
        // available: a vector field shaded by magnitude throws away the half
        // of the data that says where the air is going. It is only offered by
        // a schema declaring `vector`, and falls back to a heatmap on one
        // that does not rather than drawing nothing.
        { value: "particles", label: "Particles" },
        { value: "heatmap", label: "Heatmap" },
        { value: "cells", label: "Shaded cells" },
        { value: "off", label: "Off" },
      ],
      fallback: "particles",
    },
  ],
  accepts(refs) {
    /*
      Five ways to be mappable, and only one of them needs a lookup table.

      A gridded field, a moving fleet and a located stream all carry their own
      position — the grid in its cell id, the fleet and the located stream in
      every row — and a schema declaring `mockLocations` invents one per
      entity, marked mock on every surface that draws it. So none of those is
      asked whether we happen to know where its entities are. Only named
      places are, and for those the answer really is no when we do not.
      (`mockLocations` was missing from this list once: the emitter placed
      every settlement point while accepts refused any node that was not a
      hub, so the map greyed out for exactly the streams the invented
      positions were built for.)
    */
    const hasField = refs.some(
      (r) => schemaById(r.schemaId)?.field,
    );
    const hasMotion = refs.some(
      (r) => schemaById(r.schemaId)?.motion,
    );
    const hasLocated = refs.some(
      (r) =>
        schemaById(r.schemaId)?.located ||
        schemaById(r.schemaId)?.mockLocations,
    );

    if (refs.length === 0)
      return { ok: false, why: "Pick a series." };
    if (hasField || hasMotion || hasLocated)
      return { ok: true };

    const nodes = refs.flatMap((r) => {
      const n = node(r);
      return n
        ? [n]
        : (schemaFor(r.schemaId)?.entities.sample ?? []);
    });
    return hasGeography(nodes)
      ? { ok: true }
      : {
          ok: false,
          why: "None of those have a known location.",
        };
  },

  emit(refs, i, o) {
    const name = `Map${i}`;

    // Two kinds of reference, two treatments. A gridded schema becomes a
    // surface; everything else stays a labelled pin.
    const fieldRef = refs.find(
      (r) => schemaById(r.schemaId)?.field,
    );
    const motionRef = refs.find(
      (r) => schemaById(r.schemaId)?.motion,
    );
    const pointRefs = refs.filter(
      (r) =>
        !schemaById(r.schemaId)?.field &&
        !schemaById(r.schemaId)?.motion,
    );
    const s = series(pointRefs.length ? pointRefs : refs);

    /*
      A located stream places its own pins, so none of the lookup below applies
      to it: the coordinates arrive on the rows and the entities are whatever
      the query returns, which means a station the source adds tomorrow appears
      without anyone editing a table. Mixing one with an ERCOT stream in a
      single map is not offered — two placement rules in one layer is a
      different component — so the located ref wins the layer outright.
    */
    const locatedRef = pointRefs.find(
      (r) =>
        schemaById(r.schemaId)?.located ||
        schemaById(r.schemaId)?.mockLocations,
    );
    const locatedSchema = locatedRef
      ? schemaById(locatedRef.schemaId)
      : undefined;
    // Declared, then the fan-out key, then `node`. Day-ahead rows say `bus`,
    // and a placement path that assumed one column drew one stream and silently
    // nothing for the other.
    const locatedEntity =
      locatedSchema?.entityColumn ??
      locatedSchema?.entityKey ??
      "node";
    /*
      Invented geography, carried through rather than decided once and forgotten.

      This flag is the entire basis on which `geoMock` is allowed to exist: it
      reaches the badge, the popup and the legend, so a map of positions nobody
      published cannot be mistaken for one of positions somebody did. Note it is
      separate from `anyMock`, which is about the numbers — here the prices are
      real and only the places are made up, and saying which half is fabricated
      is more useful than branding the whole tile.
    */
    const invented = Boolean(locatedSchema?.mockLocations);
    /*
      Past a few hundred entities a pin stops being a pin.

      A Mapbox DOM marker is a real element, and a thousand of them is a
      thousand nodes the browser lays out and repositions on every frame of a
      pan — unusable long before the settlement points run out. A large set goes
      into a GL circle layer instead: same points, same color scale, one draw.
      What it gives up is the label baked into each marker, which is what the
      hover readout is for.
    */
    const dense =
      (locatedRef?.subset?.entities.length ??
        locatedSchema?.entities.count ??
        0) > 200;

    const nodes = locatedRef
      ? []
      : [
          ...new Set(
            pointRefs.flatMap((r) => {
              const n = node(r);
              if (n) return [n];
              // A subset chip names its entities outright; only the open
              // whole-stream chip falls back to guessing from the samples.
              if (r.subset) return r.subset.entities;
              const sample =
                schemaFor(r.schemaId)?.entities.sample ??
                [];
              return Object.keys(ERCOT_POINTS).filter(
                (k) =>
                  sample.includes(k) ||
                  k.startsWith(
                    sample[0]?.slice(0, 3) ?? "\u00a7",
                  ),
              );
            }),
          ),
        ].filter((n) => n in ERCOT_POINTS);

    const points = Object.fromEntries(
      nodes.map((n) => [n, ERCOT_POINTS[n]]),
    );
    const anyMock = refs.some(
      (r) => r.availability === "mock",
    );

    const fieldSchema = fieldRef
      ? schemaById(fieldRef.schemaId)
      : undefined;
    const fieldColumn = fieldRef ? column(fieldRef) : "";
    const fieldUnit = fieldRef ? unit(fieldRef) : "";
    const fieldDataset =
      fieldSchema?.dataset ?? fieldSchema?.id ?? "";
    // Particles need both halves of the vector, so they are only drawn for a
    // schema that declares which columns those are. Asked for on a scalar
    // field, the mode degrades to a heatmap — there is nothing to advect
    // through, and refusing outright would leave an empty tile.
    const vector = fieldSchema?.vector;
    const fieldMode =
      o.field === "particles" && !vector
        ? "heatmap"
        : o.field;
    // Cells are named by the schema's own entity column, not by `node`.
    const fieldEntity = fieldSchema?.entityKey ?? "cell";
    const showField =
      Boolean(fieldRef) && fieldMode !== "off";

    const motionSchema = motionRef
      ? schemaById(motionRef.schemaId)
      : undefined;
    const motionDataset =
      motionSchema?.dataset ?? motionSchema?.id ?? "";
    const trails = o.trails !== "off";
    // Enough readings back to draw a tail without hauling a history nobody sees.
    const motionLimit = trails ? 14 : 1;

    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  // Sixteen points, because a wind direction read as "SSE" is the one a
  // forecaster would say out loud and "157.5 degrees" is not.
  const CARDINALS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const POINTS = ${JSON.stringify(points, null, 2).replace(/\n/g, "\n  ")};
  const NODES = Object.keys(POINTS);
  const COLUMN = ${JSON.stringify(s[0]?.column ?? "")};
  const UNIT = ${JSON.stringify(s[0]?.unit ?? "")};
  const STYLE = ${JSON.stringify(o.style)};
  const LOCATED = ${locatedRef ? JSON.stringify({ entity: locatedEntity, label: locatedRef.label, invented, dense }) : "null"};
  // Absolute color stops for the point layer's measure, when its variable
  // declares them. Null falls back to percentiles of whatever is on screen.
  const SCALE = ${JSON.stringify(pointScale(pointRefs.length ? pointRefs : refs))};
${locatedRef && invented ? MOCK_POINT_SOURCE : ""}
  const FIELD = ${showField ? JSON.stringify({ dataset: fieldDataset, column: fieldColumn, unit: fieldUnit, mode: fieldMode, label: fieldRef!.label, entity: fieldEntity, direction: vector?.direction ?? null }) : "null"};
  const MOTION = ${motionRef ? JSON.stringify({ dataset: motionDataset, trails, label: motionRef.label }) : "null"};

  /*
    The scrubber's instant, scoped to this map alone.

    It used to drive the page-wide cursor, so scrubbing one map dragged every
    other tile on the screen through time with it. The instant is local state
    now, handed to useSeries, which bounds only this tile's queries at it —
    the rest of the screen stays on its own time. Declared above the queries
    because the queries are what it rewrites.
  */
  const CURSOR_BACK_H = 24, CURSOR_FWD_H = 48, CURSOR_STEP = 3600000;
  const hourFloor = (ms) => Math.floor(ms / CURSOR_STEP) * CURSOR_STEP;
  const [cursorNow, setCursorNow] = React.useState(() => hourFloor(Date.now()));
  const [cursorAt, setCursorAt] = React.useState(null);
  React.useEffect(() => {
    // Only while live, so the scale cannot slide under a handle somebody set.
    if (cursorAt) return;
    const id = setInterval(() => setCursorNow(hourFloor(Date.now())), 60000);
    return () => clearInterval(id);
  }, [cursorAt]);
  const cursorMs = cursorAt ? Date.parse(cursorAt) : cursorNow;
  // The scrubber's clock follows the navbar's timezone choice like every
  // other clock on the page — source time by default, never the browser's
  // own guess.
  const tz = useTz(${JSON.stringify(sourceTz(refs))});

  const { rows, error, loading } = useSeries(
    [
${
  locatedRef
    ? /*
         A whole-stream reference carries no node filter: a located stream
         fans out, so the query asks for everything and the pins are whatever
         came back. A subset chip filters at the server instead — nine hubs'
         rows, not 1,118 thinned after delivery — and its limit is sized to
         the subset. `end` is the load-bearing half either way — a forecast's
         newest row is seven days out, and a map of "now" that drew next
         Sunday would be wrong in a way nobody would catch by looking at it.
         Bounded at now, the newest row is the current one for observations
         and forecasts alike.
      */
      `      { dataset: ${JSON.stringify(s[0]?.dataset ?? "")}, ${
        locatedRef.subset
          ? `node: ${JSON.stringify(locatedRef.subset.entities)}, `
          : ""
      }end: "-0m", limit: ${
        locatedRef.subset
          ? Math.min(
              DRAW_CAP,
              Math.max(
                30,
                locatedRef.subset.entities.length * 2,
              ),
            )
          : Math.min(
              DRAW_CAP,
              Math.max(
                60,
                (locatedSchema?.entities.count ?? 50) * 2,
              ),
            )
      } },`
    : nodes.length
      ? `      { dataset: ${JSON.stringify(s[0]?.dataset ?? "")}, node: NODES, limit: 1 },`
      : ""
}
${
  showField
    ? /*
         The whole newest hour of the field, not one row. `limit: 1` was right
         when a field was a handful of mock cells; a real grid needs every cell
         of one hour, so the limit is the cell count with headroom and the
         newest row per cell wins. `end` bounds it at now for the same reason
         the point layer does — a forecast field's newest interval is two days
         out, and a wind map of the day after tomorrow looks exactly like a
         wind map of now.
      */
      `      { dataset: ${JSON.stringify(fieldDataset)}, end: "-0m", limit: ${Math.min(4000, (fieldSchema?.entities.count ?? 200) * 2)} },`
    : ""
}
${motionRef ? `      { dataset: ${JSON.stringify(motionDataset)}, start: "-30m", limit: ${motionLimit} },` : ""}
    ],
    ${refreshMs(refs)},
    cursorAt,
  );

  const pointRows = ${locatedRef || nodes.length ? "rows[0] || []" : "[]"};
  const fieldRows = ${showField ? `rows[${locatedRef || nodes.length ? 1 : 0}] || []` : "[]"};
  const flightRows = ${motionRef ? `rows[${(locatedRef || nodes.length ? 1 : 0) + (showField ? 1 : 0)}] || []` : "[]"};

  const ready = useMapbox();
  const theme = useFrameTheme();
  const style = STYLE === "auto" ? (theme === "light" ? "light-v11" : "dark-v11") : STYLE;

  const host = React.useRef(null);
  const map = React.useRef(null);
  const markers = React.useRef([]);

  /*
    Where each pin goes, and what it reads.

    Two sources for the same shape. A lookup stream is placed from the table
    compiled in above and its rows carry one value per node. A located stream
    brings both: the newest row per entity carries the coordinate and the
    value together, so a place appears the moment the source publishes one.

    Rows arrive newest-first, so the first row seen for an entity is its
    current one and later rows are history — hence the guard rather than an
    assignment that would leave the oldest reading winning.
  */
  const placed = React.useMemo(() => {
    const out = {};
    if (LOCATED) {
      pointRows.forEach((r) => {
        const id = r[LOCATED.entity];
        if (id == null || out[id]) return;
        // Two sources of position, and which applies is a fact about the stream
        // rather than about the row: coordinates the source published, or ones
        // derived from the id because it published none.
        let lon = r.lon, lat = r.lat;
        if (LOCATED.invented && (typeof lat !== "number" || typeof lon !== "number")) {
          const p = mockPoint(String(id));
          lat = p.lat; lon = p.lon;
        }
        if (typeof lat !== "number" || typeof lon !== "number") return;
        // exact drives the caveat, so an invented position is never exact
        // however confidently it was computed.
        out[id] = { lon, lat, label: String(id), value: r[COLUMN], exact: !LOCATED.invented };
      });
    } else {
      NODES.forEach((n) => {
        const row = pointRows.find((r) => r.node === n);
        if (!row) return;
        out[n] = { ...POINTS[n], value: row[COLUMN], exact: false };
      });
    }
    return out;
  }, [rows]);

  /*
    The legend, which is also the layer switch.

    A multi-layer map needs a legend whatever else is true — a color ramp
    nobody can read and pins whose size means something undocumented are a
    picture, not a chart. So this is *content*, and that is what lets it sit on
    a launched screen at all: the rule that a screen on a wall carries no chrome
    is about the product's own furniture, and a key to the marks on a map is the
    opposite of furniture.

    Toggling then costs nothing extra, which is the argument for putting it here
    rather than adding switches — a control that had to justify itself
    separately would have been chrome.

    The state is ephemeral on purpose: per viewer, per session, never a
    revision. Hiding a layer to see what is beneath it is looking, not editing,
    which is the reasoning full screen already follows.
  */
  const LAYERS = ${JSON.stringify([
    ...(locatedRef || nodes.length
      ? [
          {
            id: "points",
            label: s[0]?.label ?? "Points",
            unit: s[0]?.unit ?? "",
            swatch: "#d9a441",
            note: invented ? "invented positions" : "",
          },
        ]
      : []),
    ...(showField
      ? [
          {
            id: "field",
            label: fieldRef!.label,
            unit: fieldUnit,
            swatch:
              fieldMode === "particles"
                ? "#7dd3fc"
                : "#2b6cb0",
            note:
              fieldMode === "particles"
                ? "particles"
                : "surface",
          },
        ]
      : []),
    ...(motionRef
      ? [
          {
            id: "motion",
            label: motionRef.label,
            unit: "",
            swatch: "#6f8768",
            note: "tracked",
          },
        ]
      : []),
  ])};
  const [hidden, setHidden] = React.useState({});
  const shown = (id) => !hidden[id];

  /*
    Draw order, rearranged by dragging, top of the list on top of the map.

    Ephemeral like the visibility toggles, and for the same reason: deciding
    what sits above what while reading a map is looking, not editing. The
    editor's layer list is where an order is *kept*.

    It reaches the map through moveLayer, which only governs layers inside the
    GL stack. The particle field is a canvas composited over the whole map and
    cannot go beneath an opaque basemap, so it is pinned to the top and the
    panel says so rather than offering a handle that would do nothing.
  */
  const [order, setOrder] = React.useState(() => LAYERS.map((L) => L.id));
  // A ref for what is being dragged, state only for showing it. The handler
  // that reorders runs inside dragover, which can fire in the same tick as
  // dragstart — and a state read there sees the render before the drag began.
  // The canvas drag already keeps its grab in a ref for exactly this reason.
  const dragRef = React.useRef(null);
  const [dragId, setDragId] = React.useState(null);
  const ordered = order
    .map((id) => LAYERS.find((L) => L.id === id))
    .filter(Boolean);
  const movable = (L) => !(L.id === "field" && FIELD && FIELD.mode === "particles");

  const reorder = (from, to) => {
    if (from === to) return;
    setOrder((prev) => {
      const fromI = prev.indexOf(from), toI = prev.indexOf(to);
      if (fromI < 0 || toI < 0) return prev;
      const next = prev.filter((x) => x !== from);
      /*
        Which side of the target to land on, and it is not a detail.

        Pulling the dragged item out first shifts everything after it up one,
        so inserting *before* the target when moving down puts it back exactly
        where it started — the list looked frozen and the code looked correct.
        Down lands after, up lands before.
      */
      next.splice(next.indexOf(to) + (fromI < toI ? 1 : 0), 0, from);
      return next;
    });
  };

  // Bottom of the list is drawn first, so it ends up underneath.
  React.useEffect(() => {
    const m = map.current;
    if (!m || !ready || ready === "no-token") return;
    const glFor = { points: "dryos-pts", field: "dryos-field", motion: "dryos-flights" };
    try {
      [...order].reverse().forEach((id) => {
        const layer = glFor[id];
        if (layer && m.getLayer(layer)) m.moveLayer(layer);
      });
    } catch {
      // A restyle can land between the check and the move; the next render
      // reapplies it, and a half-ordered map is better than a dead tile.
    }
    // Not field: it is declared below this and would be read before it
    // exists. hidden stands in for it — a layer is only ever re-added when
    // something was toggled, and that is the moment the order needs reapplying.
  }, [order, ready, placed, hidden]);

  /*
    What instant the rows actually are, which is not always the one asked for.

    A query bounded at the cursor returns the newest row at or before it — so
    scrubbing a backward-looking feed into the future returns the same rows as
    live, and the map does not change. That is correct, and it looked broken:
    real-time prices have no tomorrow, and nothing on screen said so.

    So the scrubber states the data's own instant whenever it lags the cursor by
    more than an hour. Silence here is the actual defect; the values were never
    wrong.
  */
  const dataMs = React.useMemo(() => {
    let newest = 0;
    pointRows.forEach((r) => {
      const t = Date.parse(r.interval_start_utc);
      if (t && t > newest) newest = t;
    });
    return newest || null;
  }, [rows]);
  const behind = cursorAt && dataMs && cursorMs - dataMs > 3600000;
  const cursorLabel = cursorAt
    ? new Date(cursorMs).toLocaleString([], { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Live";

  /*
    Marks along the scale, so the handle is a time rather than a position.

    Every twelve hours across the three-day window, and each one is labelled
    with the day when the day changes and the hour otherwise — a row of
    identical "12 PM"s tells you nothing about which noon you are on.
  */
  const TICKS = React.useMemo(() => {
    const out = [];
    const from = cursorNow - CURSOR_BACK_H * CURSOR_STEP;
    const to = cursorNow + CURSOR_FWD_H * CURSOR_STEP;
    let last = null;
    for (let t = from; t <= to; t += 12 * CURSOR_STEP) {
      const d = new Date(t);
      const day = d.toLocaleDateString([], { timeZone: tz, month: "short", day: "numeric" });
      out.push({
        at: t,
        label: day === last ? d.toLocaleTimeString([], { timeZone: tz, hour: "numeric" }) : day,
      });
      last = day;
    }
    return out;
  }, [cursorNow, tz]);

  /*
    A grid cell carries its own position: G_315_1005 is 31.5N 100.5W. Encoding
    it in the id means no lookup table has to travel with the data.
  */
  const field = React.useMemo(() => {
    if (!FIELD || FIELD.mode === "particles") return null;
    const features = [];
    const seen = {};
    let lo = Infinity, hi = -Infinity;
    fieldRows.forEach((r) => {
      const id = r[FIELD.entity];
      const m = /^G_(\\d+)_(\\d+)$/.exec(id || "");
      const v = r[FIELD.column];
      // Newest first, so the first row for a cell is its current one.
      if (!m || typeof v !== "number" || seen[id]) return;
      seen[id] = true;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      features.push({
        type: "Feature",
        properties: { v },
        geometry: { type: "Point", coordinates: [-Number(m[2]) / 10, Number(m[1]) / 10] },
      });
    });
    if (!features.length) return null;
    return { data: { type: "FeatureCollection", features }, lo, hi };
  }, [rows]);

  /*
    The same cells as a velocity grid, for advection.

    Two conversions matter here and both are one-way doors. Direction is
    published as the bearing the wind comes FROM, so the vector the air travels
    along is the negation, not the value — u = -speed*sin(d), v = -speed*cos(d)
    is the textbook form and the reason this is not written as "d + 180"
    somewhere further down where it would be a magic number. And the grid is
    stored as a sparse list of cells whose ids carry their positions, so it is
    rebuilt into a dense lattice once here rather than searched per particle
    per frame.
  */
  const flow = React.useMemo(() => {
    if (!FIELD || FIELD.mode !== "particles" || !FIELD.direction) return null;
    const cells = {};
    const lats = new Set(), lons = new Set();
    let lo = Infinity, hi = -Infinity;
    fieldRows.forEach((r) => {
      const id = r[FIELD.entity];
      const m = /^G_(\\d+)_(\\d+)$/.exec(id || "");
      const spd = r[FIELD.column], dir = r[FIELD.direction];
      if (!m || typeof spd !== "number" || typeof dir !== "number") return;
      const lat = Number(m[1]) / 10, lon = -Number(m[2]) / 10;
      const key = lat + ":" + lon;
      if (cells[key]) return;
      const rad = (dir * Math.PI) / 180;
      cells[key] = { u: -spd * Math.sin(rad), v: -spd * Math.cos(rad), spd };
      lats.add(lat); lons.add(lon);
      lo = Math.min(lo, spd); hi = Math.max(hi, spd);
    });
    const la = [...lats].sort((a, b) => a - b);
    const lo_ = [...lons].sort((a, b) => a - b);
    if (la.length < 2 || lo_.length < 2) return null;
    const step = Math.min(la[1] - la[0], lo_[1] - lo_[0]);

    // Bilinear between the four surrounding cells. Outside the grid returns
    // null, which is what retires a particle — a field has edges and pretending
    // otherwise would drift particles through invented air.
    const at = (lon, lat) => {
      if (lon < lo_[0] || lon > lo_[lo_.length - 1] || lat < la[0] || lat > la[la.length - 1]) return null;
      const x0 = Math.floor((lon - lo_[0]) / step) * step + lo_[0];
      const y0 = Math.floor((lat - la[0]) / step) * step + la[0];
      const fx = (lon - x0) / step, fy = (lat - y0) / step;
      const c = (x, y) => cells[Math.round(y * 10) / 10 + ":" + Math.round(x * 10) / 10];
      const a = c(x0, y0), b = c(x0 + step, y0), d = c(x0, y0 + step), e = c(x0 + step, y0 + step);
      if (!a || !b || !d || !e) return a || b || d || e || null;
      const mix = (k) =>
        a[k] * (1 - fx) * (1 - fy) + b[k] * fx * (1 - fy) + d[k] * (1 - fx) * fy + e[k] * fx * fy;
      return { u: mix("u"), v: mix("v"), spd: mix("spd") };
    };
    return { at, lo, hi, bounds: [lo_[0], la[0], lo_[lo_.length - 1], la[la.length - 1]] };
  }, [rows]);

  React.useEffect(() => {
    if (!ready || !host.current || map.current) return;
    map.current = new window.mapboxgl.Map({
      // A double click on the map asks about the node under it (see Section),
      // so it must not also zoom. The wheel and the controls still do.
      doubleClickZoom: false,
      container: host.current,
      style: "mapbox://styles/mapbox/" + style,
      center: [${ERCOT_VIEW.lon}, ${ERCOT_VIEW.lat}],
      zoom: ${ERCOT_VIEW.zoom},
      attributionControl: true,
    });
    return () => { map.current && map.current.remove(); map.current = null; };
  }, [ready]);

  React.useEffect(() => {
    if (!ready || !host.current) return;
    const ro = new ResizeObserver(() => { map.current && map.current.resize(); });
    ro.observe(host.current);
    return () => ro.disconnect();
  }, [ready]);

  const firstStyle = React.useRef(true);
  React.useEffect(() => {
    if (!map.current) return;
    if (firstStyle.current) { firstStyle.current = false; return; }
    map.current.setStyle("mapbox://styles/mapbox/" + style);
  }, [style]);

  /*
    The field, as a source plus a layer.

    Re-applied on every "style.load" as well as on new data, because setStyle
    throws away every source and layer the map did not come with — a base-map
    change would otherwise silently take the weather with it.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m || !field || !shown("field")) return;

    const paint =
      FIELD.mode === "cells"
        ? {
            id: "dryos-field",
            type: "circle",
            source: "dryos-field",
            paint: {
              // Same reasoning as the heatmap radius: wide enough to touch its
              // neighbours, blurred enough that the seams do not show.
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 26, 5, 52, 7, 100],
              "circle-blur": 1,
              "circle-opacity": 0.5,
              "circle-color": [
                "interpolate", ["linear"], ["get", "v"],
                field.lo, "#2b6cb0", (field.lo + field.hi) / 2, "#d9a441", field.hi, "#c4703a",
              ],
            },
          }
        : {
            id: "dryos-field",
            type: "heatmap",
            source: "dryos-field",
            paint: {
              // Weight is the value, floored above zero so a cold cell still
              // paints — at zero weight it would vanish and read as no data.
              "heatmap-weight": [
                "interpolate", ["linear"], ["get", "v"], field.lo, 0.15, field.hi, 1,
              ],
              "heatmap-intensity": 1,
              /*
                Radius has to exceed the grid spacing or the field renders as a
                dot per cell with gaps between them. These are ~1.5 degrees
                apart, which is roughly 60px at the opening zoom, so the kernels
                have to be wider than that to blend into a surface.
              */
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 55, 5, 110, 7, 210],
              "heatmap-opacity": 0.7,
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.08, "#2b6cb0",
                0.32, "#6f8768",
                0.58, "#d9a441",
                0.85, "#c4703a",
                1, "#a34a22",
              ],
            },
          };

    const apply = () => {
      if (!m.isStyleLoaded()) return;
      const src = m.getSource("dryos-field");
      if (src) { src.setData(field.data); return; }
      m.addSource("dryos-field", { type: "geojson", data: field.data });
      m.addLayer(paint);
    };

    apply();
    m.on("style.load", apply);
    m.on("load", apply);
    return () => { m.off("style.load", apply); m.off("load", apply); };
  }, [field, ready, style, hidden]);

  /*
    Particles, on a plain 2D canvas laid over the map.

    Not a Mapbox custom layer and not WebGL: the whole field is 168 cells, the
    particle count is in the low thousands, and \`map.project\` already turns a
    coordinate into a screen point through whatever pan and zoom is current —
    so the canvas needs no projection maths of its own and follows the map for
    free.

    The trail is made by *erasing* the previous frame a little rather than
    painting a translucent wash over it. A wash accumulates, and ten seconds in
    the basemap is behind a grey film; \`destination-out\` fades old strokes
    toward transparent and leaves the map underneath alone.

    Particles retire two ways: age, so the field does not end up combed into a
    few attractors, and leaving the grid, because \`flow.at\` returns null
    outside it. Drifting them onward through absent data would be inventing
    wind, which is the one thing this whole stream exists to avoid.
  */
  /*
    What the wind is doing where the pointer is.

    Read straight out of flow.at(), which is the same bilinear interpolation the
    particles are advected through — so the number in the readout is the number
    that moved the streak under the cursor, rather than the nearest cell's value
    rounded to a different answer.

    Off the grid it reads nothing at all. There is no wind here to report at the
    edge of the data, and a readout that kept showing the last value it saw
    would be the same invention the whole stream exists to avoid.
  */
  const [probe, setProbe] = React.useState(null);
  // The readout, for the click that asks about it (askPayload in the
  // runtime): the node under the pointer and its value, or the wind there.
  // The entity rides along so the ask keeps every row of that node ahead of
  // thinning a thousand-node layer down for the wire.
  React.useEffect(() => {
    window.__dryosHover = !probe
      ? null
      : probe.kind === "point"
        ? { when: null, label: probe.id, entity: probe.id, values: [{ name: probe.id, value: probe.value, unit: UNIT }] }
        : {
            when: null,
            label: "wind at " + probe.lat.toFixed(2) + ", " + probe.lon.toFixed(2),
            entity: null,
            values: [
              { name: "speed", value: probe.spd, unit: FIELD ? FIELD.unit : "" },
              { name: "from", value: probe.dir, unit: "deg" },
            ],
          };
  }, [probe]);
  /*
    The placed nodes, in a ref rather than in the effect's dependencies.

    Putting the data in the deps rebinds the pointer handler on every poll, and
    the cleanup that runs with it clears the readout — so a five-minute feed
    took the tooltip away from under somebody's cursor, and a fast one made it
    impossible to read at all. A ref lets the handler see the newest rows while
    staying bound from the first render to the last.
  */
  const placedRef = React.useRef(placed);
  React.useEffect(() => { placedRef.current = placed; }, [placed]);

  /*
    The layer the pointer is reading: the topmost one that is switched on.

    Only that layer answers, and it answers or it does not — a hover never
    falls through to what is underneath. That matters because a readout is a
    number without a label on it: if hovering between two nodes quietly
    returned the wind below them, you would read a value and attribute it to
    the layer you can see. Answering nothing is unambiguous.

    It also gives reordering a second job. Dragging a layer to the top is not
    only about what is drawn over what, it decides what the map tells you when
    you point at it — which is usually the reason you wanted it on top.

    In a ref for the same reason the rows are: the handler binds once, and
    reading this out of the closure would leave it fixed at whatever the order
    was on first render.
  */
  const topId = ordered.find((L) => shown(L.id))?.id ?? null;
  const topRef = React.useRef(topId);
  React.useEffect(() => { topRef.current = topId; }, [topId]);
  React.useEffect(() => {
    const m = map.current;
    if (!m || !ready || ready === "no-token") return;
    const move = (e) => {
      const oe = e.originalEvent;
      /*
        A point answers where it is. A field answers everywhere.

        That is not a preference, it is what the two kinds of data are. Wind is
        defined at every coordinate, so interpolating between cells and
        reporting a value under the cursor is the truth. A price exists at a
        settlement point and nowhere else — there is no price "here", so
        reporting one between nodes would be inventing the one number this map
        is about. Nodes are therefore hit-tested against what is actually
        rendered, and the readout stays away unless the pointer is on one.
      */
      // Nothing switched on is nothing to read.
      const top = topRef.current;
      if (!top) return setProbe(null);

      if (top === "points" && LOCATED) {
        /*
          Nearest placed node, within a few pixels of the cursor.

          Measured against the rows rather than by hit-testing the GL layer:
          queryRenderedFeatures wants pixel-exact contact with a circle three
          pixels across, which is a game rather than a hover, and it only knows
          about the dense path — the marker path would need a second mechanism.
          Comparing coordinates works for both, and a thousand subtractions per
          mousemove costs nothing.

          The threshold is converted from pixels through the map's own bounds,
          so it stays the same *visual* distance at every zoom. A fixed
          tolerance in degrees would be a county at one zoom and a car park at
          another.
        */
        const p = placedRef.current;
        const bounds = m.getBounds();
        const perPx = (bounds.getEast() - bounds.getWest()) / Math.max(1, m.getCanvas().clientWidth);
        const reach = perPx * 7;
        let best = null, bestD = Infinity;
        for (const id in p) {
          const dx = (p[id].lon - e.lngLat.lng) * Math.cos((e.lngLat.lat * Math.PI) / 180);
          const dy = p[id].lat - e.lngLat.lat;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = id; }
        }
        if (best && Math.sqrt(bestD) <= reach) {
          setProbe({
            kind: "point",
            id: best,
            value: p[best].value,
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            x: oe.clientX,
            y: oe.clientY,
          });
          return;
        }
        // The top layer is the nodes and the pointer is not on one. It does not
        // fall through to whatever is beneath: between two nodes there is no
        // price, and borrowing a number from another layer would put a value on
        // screen that belongs to something you are not pointing at.
        return setProbe(null);
      }

      if (top !== "field" || !flow) return setProbe(null);
      const f = flow.at(e.lngLat.lng, e.lngLat.lat);
      if (!f) return setProbe(null);
      setProbe({
        kind: "field",
        spd: f.spd,
        // Back to the published convention: the bearing the wind comes FROM,
        // which is the negation of the velocity we advect along.
        dir: (Math.atan2(-f.u, -f.v) * 180) / Math.PI,
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        x: oe.clientX,
        y: oe.clientY,
      });
    };
    const off = () => setProbe(null);
    /*
      A click on a node is a selection, announced to the page: any tile wired
      to this map (its \`follow\` option naming this tile's index) retargets
      its queries at the picked entity. Same nearest-row matching as the
      hover, for the same reason — and it works for both the marker path and
      the dense GL path, because \`placed\` is the one source both draw from.
    */
    const pick = (e) => {
      const p = placedRef.current;
      const bounds = m.getBounds();
      const perPx = (bounds.getEast() - bounds.getWest()) / Math.max(1, m.getCanvas().clientWidth);
      const reach = perPx * 10;
      let best = null, bestD = Infinity;
      for (const id in p) {
        const dx = (p[id].lon - e.lngLat.lng) * Math.cos((e.lngLat.lat * Math.PI) / 180);
        const dy = p[id].lat - e.lngLat.lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best && Math.sqrt(bestD) <= reach) {
        window.dispatchEvent(new CustomEvent("dryos:pick", { detail: { source: ${i}, entity: best } }));
      }
    };
    m.on("mousemove", move);
    m.on("mouseout", off);
    m.on("click", pick);
    return () => { m.off("mousemove", move); m.off("mouseout", off); m.off("click", pick); setProbe(null); };
    // Not placed: the point branch hit-tests what the map has rendered rather
    // than reading the row set, so it needs no data in scope — and adding data
    // here would rebind the handler on every poll, with a cleanup that clears
    // the readout somebody is in the middle of reading.
  }, [flow, ready]);

  const veil = React.useRef(null);
  React.useEffect(() => {
    const cv = veil.current, m = map.current;
    if (!cv || !m || !flow || !ready || ready === "no-token" || !shown("field")) return;
    const g = cv.getContext("2d");
    if (!g) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Pace is a display choice, not physics: real advection at 5 m/s is
    // microscopic per frame, so this is a scale factor, not a speed. It is
    // the *only* thing that sets the overall tempo — every particle still
    // steps u and v, which carry the magnitude, so a 10 m/s cell moves ten
    // times as far per frame as a 1 m/s one at any pace.
    //
    // MAX_AGE is in frames, so slowing the pace without raising it would
    // retire particles a third of the way through the journey they used to
    // make and thin the field out. The fade has to slow with it too: a slower
    // particle draws a shorter segment per frame — well under a pixel at the
    // low end — and those only add up to a streak if the earlier ones are
    // still there when the later ones land.
    const N = 2200, MAX_AGE = 260, PACE = 0.0025;
    const [w0, s0, e0, n0] = flow.bounds;
    let raf = 0, alive = true;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    const color = (spd) => {
      const t = flow.hi === flow.lo ? 0.5 : (spd - flow.lo) / (flow.hi - flow.lo);
      return t > 0.66 ? "#c4703a" : t > 0.33 ? "#d9a441" : "#7dd3fc";
    };

    const spawn = (p) => {
      p.lon = w0 + Math.random() * (e0 - w0);
      p.lat = s0 + Math.random() * (n0 - s0);
      p.age = Math.floor(Math.random() * MAX_AGE);
    };
    const parts = Array.from({ length: N }, () => { const p = {}; spawn(p); return p; });

    // The still version, for anyone who has asked not to be moved at. Arrows
    // at every cell say the same thing about direction and speed; only the
    // sense of flow is lost, and that is the trade the setting is asking for.
    const still = () => {
      const r = cv.getBoundingClientRect();
      g.clearRect(0, 0, r.width, r.height);
      g.lineWidth = 1.4;
      for (let lat = s0; lat <= n0 + 1e-9; lat += 1) {
        for (let lon = w0; lon <= e0 + 1e-9; lon += 1) {
          const f = flow.at(lon, lat);
          if (!f) continue;
          const a = m.project([lon, lat]);
          if (a.x < 0 || a.x > r.width || a.y < 0 || a.y > r.height) continue;
          const t = flow.hi === flow.lo ? 0.5 : (f.spd - flow.lo) / (flow.hi - flow.lo);
          const len = 7 + 15 * t;
          const n = Math.hypot(f.u, f.v) || 1;
          // Screen y grows downward, so the northward component is negated.
          const dx = (f.u / n) * len, dy = (-f.v / n) * len;
          g.strokeStyle = color(f.spd);
          g.beginPath();
          g.moveTo(a.x - dx / 2, a.y - dy / 2);
          g.lineTo(a.x + dx / 2, a.y + dy / 2);
          g.stroke();
        }
      }
    };

    const frame = () => {
      if (!alive) return;
      const r = cv.getBoundingClientRect();
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0,0,0,0.018)";
      g.fillRect(0, 0, r.width, r.height);
      g.globalCompositeOperation = "source-over";
      for (const p of parts) {
        const f = flow.at(p.lon, p.lat);
        if (!f || ++p.age > MAX_AGE) { spawn(p); continue; }
        const a = m.project([p.lon, p.lat]);
        /*
          A degree of longitude is shorter than a degree of latitude, by the
          cosine of the latitude — 0.86 at the middle of this grid. Stepping
          both by the same number of degrees therefore moves a particle about
          16% too far east or west for the distance it moves north or south,
          which is not a speed error but a *direction* error: every vector is
          rotated toward the horizontal, by up to 7 degrees on a diagonal. The
          particles looked plausible and disagreed with the bearing the source
          published.

          Distance per frame stays proportional to speed, because u and v carry
          the magnitude — a 10 m/s cell steps ten times as far as a 1 m/s one,
          and draws ten times the streak in the same fade window.
        */
        const dLat = f.v * PACE;
        const dLon = (f.u * PACE) / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
        p.lat += dLat;
        p.lon += dLon;
        const b = m.project([p.lon, p.lat]);
        if (a.x < -40 || a.x > r.width + 40 || a.y < -40 || a.y > r.height + 40) continue;
        // Speed reads three ways at once — length, weight and brightness —
        // because length alone is easy to miss against a moving field.
        const t = flow.hi === flow.lo ? 0.5 : (f.spd - flow.lo) / (flow.hi - flow.lo);
        g.globalAlpha = 0.55 + 0.45 * t;
        g.lineWidth = 1.0 + 1.5 * t;
        g.strokeStyle = color(f.spd);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    // Trails are drawn in screen space, so a pan would smear them across the
    // move. Wiping on every move event costs the tail and keeps the truth.
    const wipe = () => {
      const r = cv.getBoundingClientRect();
      g.clearRect(0, 0, r.width, r.height);
      if (reduced) still();
    };
    const ro = new ResizeObserver(() => { fit(); wipe(); });
    ro.observe(cv);
    m.on("move", wipe);

    if (reduced) still(); else frame();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      m.off("move", wipe);
      const r = cv.getBoundingClientRect();
      g.clearRect(0, 0, r.width, r.height);
    };
  }, [flow, ready, style, hidden]);

  /*
    Aircraft, drawn the way every tracker draws them.

    A symbol layer rather than DOM markers: the icon rotates with
    \`icon-rotate\` straight from the track angle, it is GPU-drawn so a few
    hundred aeroplanes cost nothing, and overlap is allowed because two
    aeroplanes near each other is information rather than clutter.

    color is by barometric altitude, which is the convention — low is warm and
    near an airport, high is cool and in the cruise. Mapbox will only tint an
    icon that is a signed distance field, so instead there is one image per
    band and a \`match\` picks between them.
  */
  const BANDS = [
    { id: "lo", max: 10000, color: "#c4703a" },
    { id: "mid", max: 24000, color: "#d9a441" },
    { id: "hi", max: 34000, color: "#6f8768" },
    { id: "top", max: Infinity, color: "#7dd3fc" },
  ];

  const flights = React.useMemo(() => {
    if (!MOTION) return null;
    const byId = new Map();
    flightRows.forEach((r) => {
      if (typeof r.lat !== "number" || typeof r.lon !== "number") return;
      const list = byId.get(r.icao24) || [];
      list.push(r);
      byId.set(r.icao24, list);
    });
    if (!byId.size) return null;

    const points = [];
    const lines = [];
    byId.forEach((list, id) => {
      // Newest first out of the store, so the head of the list is now.
      const now = list[0];
      const band = BANDS.find((b) => now.baro_altitude_ft <= b.max) || BANDS[3];
      points.push({
        type: "Feature",
        properties: {
          id,
          callsign: String(now.callsign || "").trim(),
          track: now.true_track_deg || 0,
          alt: now.baro_altitude_ft,
          band: band.id,
        },
        geometry: { type: "Point", coordinates: [now.lon, now.lat] },
      });
      if (MOTION.trails && list.length > 1) {
        lines.push({
          type: "Feature",
          properties: { band: band.id },
          geometry: {
            type: "LineString",
            coordinates: list.map((r) => [r.lon, r.lat]).reverse(),
          },
        });
      }
    });

    return {
      points: { type: "FeatureCollection", features: points },
      trails: { type: "FeatureCollection", features: lines },
      count: points.length,
    };
  }, [rows]);

  React.useEffect(() => {
    const m = map.current;
    if (!m || !flights || !shown("motion")) return;

    // One plane silhouette per altitude band, drawn once into a canvas. Nose up,
    // because icon-rotate treats zero as north.
    const makeIcon = (color) => {
      const size = 34;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const g = c.getContext("2d");
      g.translate(size / 2, size / 2);
      g.fillStyle = color;
      g.strokeStyle = "rgba(0,0,0,.55)";
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(0, -14);
      g.lineTo(3, -5);
      g.lineTo(15, 3);
      g.lineTo(15, 6);
      g.lineTo(3, 3);
      g.lineTo(2.5, 10);
      g.lineTo(7, 13);
      g.lineTo(7, 15);
      g.lineTo(0, 13);
      g.lineTo(-7, 15);
      g.lineTo(-7, 13);
      g.lineTo(-2.5, 10);
      g.lineTo(-3, 3);
      g.lineTo(-15, 6);
      g.lineTo(-15, 3);
      g.lineTo(-3, -5);
      g.closePath();
      g.fill();
      g.stroke();
      return g.getImageData(0, 0, size, size);
    };

    const apply = () => {
      if (!m.isStyleLoaded()) return;

      BANDS.forEach((b) => {
        if (!m.hasImage("dryos-plane-" + b.id)) {
          m.addImage("dryos-plane-" + b.id, makeIcon(b.color));
        }
      });

      const bandColor = ["match", ["get", "band"]];
      BANDS.forEach((b) => bandColor.push(b.id, b.color));
      bandColor.push("#8998ab");

      if (MOTION.trails) {
        const t = m.getSource("dryos-trails");
        if (t) t.setData(flights.trails);
        else {
          m.addSource("dryos-trails", { type: "geojson", data: flights.trails });
          m.addLayer({
            id: "dryos-trails",
            type: "line",
            source: "dryos-trails",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": bandColor, "line-width": 1.4, "line-opacity": 0.45 },
          });
        }
      }

      const p = m.getSource("dryos-flights");
      if (p) { p.setData(flights.points); return; }

      m.addSource("dryos-flights", { type: "geojson", data: flights.points });
      m.addLayer({
        id: "dryos-flights",
        type: "symbol",
        source: "dryos-flights",
        layout: {
          /*
            A match over literal names, not a name built with concat. Mapbox
            resolves data-driven icons against images it can enumerate, and a
            constructed string is not something it can check — the layer silently
            draws nothing rather than complaining.
          */
          "icon-image": [
            "match",
            ["get", "band"],
            "lo", "dryos-plane-lo",
            "mid", "dryos-plane-mid",
            "hi", "dryos-plane-hi",
            "dryos-plane-top",
          ],
          "icon-rotate": ["get", "track"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 7, 0.95],
          "text-field": ["get", "callsign"],
          "text-size": 9,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": bandColor,
          "text-halo-color": "rgba(0,0,0,.65)",
          "text-halo-width": 1,
        },
      });

      m.on("click", "dryos-flights", (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        new window.mapboxgl.Popup({ offset: 12 })
          .setLngLat(f.geometry.coordinates)
          .setText(
            f.properties.callsign + " · " + f.properties.id +
            " · " + Number(f.properties.alt).toLocaleString() + " ft" +
            " · " + Math.round(f.properties.track) + "\u00b0"
          )
          .addTo(m);
      });
      m.on("mouseenter", "dryos-flights", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "dryos-flights", () => { m.getCanvas().style.cursor = ""; });
    };

    apply();
    m.on("style.load", apply);
    m.on("load", apply);
    return () => { m.off("style.load", apply); m.off("load", apply); };
  }, [flights, ready, style, hidden]);

  // Redrawn rather than mutated: a handful of markers is cheaper to replace
  // than to diff, and the value changes on every poll anyway.
  React.useEffect(() => {
    if (!map.current || !window.mapboxgl) return;
    const m = map.current;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    if (m.getLayer && m.getLayer("dryos-pts")) {
      m.removeLayer("dryos-pts");
      m.removeSource("dryos-pts");
    }
    if (!shown("points")) return;

    const ids = Object.keys(placed);
    const values = ids.map((n) => placed[n].value).filter((v) => typeof v === "number");
    if (!values.length) return;
    /*
      The color ramp, and why it is not min-to-max.

      Min and max are set by two readings out of a thousand, and price data is
      heavy-tailed: across one ERCOT interval p1 is about $17 and p99 about $50
      while the extremes span $136, so a linear ramp puts 98% of nodes inside a
      quarter of the color range and paints them all the same. The congestion
      you opened the map to find is the part that gets squeezed out.

      A declared scale (SCALE) fixes values to colors absolutely, so a color
      survives a refresh and $100 looks like $100 whatever else is on screen.
      Without one, percentiles are the fallback — still relative, but no longer
      collapsible by a single outlier.
    */
    const sorted = [...values].sort((x, y) => x - y);
    const pct = (f) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
    const lo = SCALE ? SCALE[0].at : pct(0.05);
    const hi = SCALE ? SCALE[SCALE.length - 1].at : pct(0.95);
    const ramp = SCALE
      ? SCALE.flatMap((s) => [s.at, s.color])
      : [pct(0.05), "#2b6cb0", pct(0.5), "#7dd3fc", pct(0.8), "#e8ff3d", pct(0.95), "#fb8b5c", pct(1), "#f4666b"];

    /*
      One mark, one channel: every node is the same dot and color carries the
      value on its own.

      Size varying with value made the map read as two overlapping claims —
      a big pale dot against a small bright one is genuinely ambiguous about
      which matters — and it distorted density, because a cluster of expensive
      nodes covered more ground than the same cluster cheap. A uniform mark
      leaves the geography saying only where nodes are, which is all it knows.

      Opacity is constant for the same reason and one more: the legend shows
      solid colors, so a node drawn at half opacity over a dark basemap is
      simply not the color in the key. Fading the ordinary majority made the
      only thing decoding the map slightly wrong about most of it.
    */

    // A large set draws as one GL layer rather than as a thousand elements.
    if (LOCATED && LOCATED.dense) {
      const data = {
        type: "FeatureCollection",
        features: ids.map((n) => ({
          type: "Feature",
          properties: { v: placed[n].value, id: n },
          geometry: { type: "Point", coordinates: [placed[n].lon, placed[n].lat] },
        })),
      };
      const paint = () => {
        const src = m.getSource("dryos-pts");
        if (src) { src.setData(data); return; }
        m.addSource("dryos-pts", { type: "geojson", data });
        m.addLayer({
          id: "dryos-pts",
          type: "circle",
          source: "dryos-pts",
          paint: {
            // One size for every node. It still grows with zoom — that is the
            // mark keeping its apparent size as the map scales, not the value
            // saying anything.
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.6, 6, 5, 9, 9],
            "circle-color": ["interpolate", ["linear"], ["get", "v"], ...ramp],
            "circle-opacity": 0.9,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "rgba(0,0,0,.5)",
          },
        });
      };
      // Called straight away and bound to both events, matching the field
      // layer. Gating the first call on isStyleLoaded() looked tidier and lost
      // the layer whenever the style had finished before this effect ran:
      // style.load never fires again, so the paint never happened at all.
      // A theme change calls setStyle, which throws away every source and layer
      // the map did not come with, which is what the rebinding is for.
      /*
        Retry on a timer, not on a map event.

        addSource throws before the style is up, and this effect only re-runs
        when the rows do — five minutes away on a real-time feed — so a single
        miss is not a flicker, it is an empty layer until the next poll. Both
        event-based attempts failed in their own way: style.load is a single
        shot that may already have gone, and waiting on idle never resolved on
        a map carrying the particle layer, which silently cost this layer
        entirely whenever the two were on one map. A short poll depends on
        nothing but the clock and stops as soon as it lands.
      */
      let tries = 0;
      let timer = null;
      const safe = () => {
        try {
          paint();
        } catch {
          if (++tries < 40) timer = setTimeout(safe, 250);
        }
      };
      safe();
      m.on("style.load", safe);
      return () => {
        if (timer) clearTimeout(timer);
        m.off("style.load", safe);
      };
    }

    ids.forEach((n) => {
      const v = placed[n].value;
      if (typeof v !== "number") return;
      // Same size for every marker, as on the dense layer. These ones carry
      // their number in the middle, so a varying circle also meant varying room
      // for the text — the widest values were drawn in the smallest badges.
      const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
      const el = document.createElement("div");
      el.style.cssText =
        "align-items:center;background:" + (t > 0.66 ? "var(--warn)" : t > 0.33 ? "var(--accent)" : "var(--info)") +
        ";border:1px solid rgba(0,0,0,.45);border-radius:999px;color:#0d1206;display:flex;font:600 10px/1 ui-sans-serif,system-ui;" +
        "height:28px;justify-content:center;width:28px;";
      el.textContent = v.toFixed(0);
      // The caveat is only true of a lookup. A located stream publishes where
      // it measured, so claiming that is approximate would be a lie about a
      // runway — and the caveat's whole job is to stop a centroid reading as
      // a substation.
      const popup = new window.mapboxgl.Popup({ offset: 14 }).setText(
        placed[n].label + " — " + v.toFixed(2) + " " + UNIT +
        (placed[n].exact
          ? ""
          : LOCATED && LOCATED.invented
            ? " (INVENTED POSITION — not published)"
            : " (approximate location)")
      );
      markers.current.push(
        new window.mapboxgl.Marker({ element: el })
          .setLngLat([placed[n].lon, placed[n].lat])
          .setPopup(popup)
          .addTo(map.current)
      );
    });
  }, [placed, ready, style, hidden]);

  if (ready === "no-token") {
    return (
      <Section index={${i}} w={w} h={h} title="Map">
        <p style={{ color: "var(--warn)", fontSize: 13 }}>
          No Mapbox token. Set <code>MAPBOX_TOKEN</code> in <code>frontend/.env.local</code> and restart.
        </p>
      </Section>
    );
  }

  return (
    <Section index={${i}} w={w} h={h} fill title=${JSON.stringify(motionRef ? "Live traffic" : fieldRef ? `${fieldRef.label} field` : `${s[0]?.label ?? "Map"} by location`)} unit={FIELD ? FIELD.unit : UNIT} loading={loading && !ready} error={error}>
      <div ref={host} style={{ background: "var(--surface-2)", border: NAKED ? "none" : "1px solid var(--line)", borderRadius: NAKED ? 0 : 6, inset: 0, position: "absolute" }} />
      {/* Over the map, under the markers, and deaf to the pointer — the map
          below still pans and zooms as if nothing were on top of it. */}
      <canvas ref={veil} style={{ borderRadius: 6, height: "100%", inset: 0, pointerEvents: "none", position: "absolute", width: "100%", zIndex: 1 }} />

      {/* ── Legend, top left. A key, not a control: it says what the marks
             mean, which is what a reader needs and what a launched screen is
             allowed to carry. Turning things on and off is a different job and
             has its own panel. ───────────────────────────────────────────── */}
      {/* Gone entirely when nothing is on, rather than an empty bordered box
          keying nothing. The layer panel is where you turn things back on. */}
      {!NAKED && ordered.some((L) => shown(L.id)) ? (
        <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 5, display: "flex", flexDirection: "column", gap: 3, left: 4, padding: "5px 7px", position: "absolute", top: 4, zIndex: 3 }}>
          {ordered.filter((L) => shown(L.id)).map((L) => (
            <div key={L.id} style={{ alignItems: "center", display: "flex", gap: 6 }}>
              <span style={{ background: L.swatch, borderRadius: 2, flexShrink: 0, height: 8, width: 8 }} />
              <span style={{ color: "var(--ink)", fontSize: 10.5, whiteSpace: "nowrap" }}>{L.label}</span>
              {L.unit ? <span style={{ color: "var(--faint)", fontSize: 9.5 }}>{L.unit}</span> : null}
              {L.note ? <span style={{ color: "var(--faint)", fontSize: 9, fontStyle: "italic" }}>{L.note}</span> : null}
            </div>
          ))}
          {/*
            The ramp itself, because "a hundred dollars stands out" only helps
            somebody who can tell that this red is a hundred dollars. A
            continuous scale with no key is decoration.

            Drawn with the stops spaced evenly rather than by value: the values
            are deliberately non-linear ($0, $25, $50, $100, $250, $1000), and
            spacing them to scale would compress everything below $250 into a
            sliver — which is the failure this whole change is undoing.
          */}
          {SCALE && shown("points") ? (
            <div style={{ marginTop: 2 }}>
              <div style={{ background: "linear-gradient(to right, " + SCALE.map((s) => s.color).join(", ") + ")", borderRadius: 2, height: 5, width: "100%" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {SCALE.map((s) => (
                  <span key={s.at} style={{ color: "var(--faint)", fontSize: 8 }}>
                    {s.label === "negative" ? "−" : s.at >= 1000 ? "1k+" : s.at}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Layers, top right. Visibility and draw order — the two things you
             change while reading rather than while building. ─────────────── */}
      {!NAKED && (LAYERS.length > 1 || (LAYERS.length === 1 && LAYERS[0].id !== "points")) ? (
        <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 5, minWidth: 132, padding: "4px 5px", position: "absolute", right: 4, top: 4, zIndex: 3 }}>
          <div style={{ color: "var(--faint)", fontSize: 8.5, letterSpacing: ".1em", padding: "0 2px 3px", textTransform: "uppercase" }}>
            Layers
          </div>
          {ordered.map((L) => (
            <div
              key={L.id}
              draggable={movable(L)}
              onDragStart={() => { dragRef.current = L.id; setDragId(L.id); }}
              onDragEnd={() => { dragRef.current = null; setDragId(null); }}
              onDragOver={(e) => { e.preventDefault(); if (dragRef.current && movable(L)) reorder(dragRef.current, L.id); }}
              style={{
                alignItems: "center", background: dragId === L.id ? "var(--surface-3)" : "transparent",
                borderRadius: 3, cursor: movable(L) ? "grab" : "default", display: "flex", gap: 5,
                opacity: shown(L.id) ? 1 : 0.45, padding: "2px 3px",
              }}
            >
              <span style={{ color: "var(--faint)", cursor: movable(L) ? "grab" : "default", fontSize: 9, width: 7 }}>
                {movable(L) ? "⠳" : "·"}
              </span>
              <button
                type="button"
                onClick={() => setHidden((h) => ({ ...h, [L.id]: !h[L.id] }))}
                title={shown(L.id) ? "Hide" : "Show"}
                style={{ alignItems: "center", background: "none", border: "none", cursor: "pointer", display: "flex", flex: 1, font: "inherit", gap: 5, padding: 0, textAlign: "left" }}
              >
                <span style={{ background: shown(L.id) ? L.swatch : "transparent", border: "1px solid " + L.swatch, borderRadius: 2, flexShrink: 0, height: 8, width: 8 }} />
                <span style={{ color: "var(--ink)", fontSize: 10, whiteSpace: "nowrap" }}>{L.label}</span>
              </button>
            </div>
          ))}
          {ordered.some((L) => !movable(L)) ? (
            <div style={{ color: "var(--faint)", fontSize: 8.5, padding: "2px 3px 0" }}>
              particles always draw on top
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Time, along the bottom. Full width because a scale is easier to
             land on the further it runs, and this one covers three days. ── */}
      {!NAKED && (
      <div style={{ background: "var(--bg)", borderRadius: 5, bottom: 22, left: 4, padding: "4px 8px 2px", position: "absolute", right: 4, zIndex: 3 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setCursorAt(null)}
            title="Back to now"
            style={{
              background: cursorAt ? "var(--accent-dim)" : "transparent",
              border: "1px solid " + (cursorAt ? "var(--accent-line)" : "var(--line)"),
              borderRadius: 3, color: cursorAt ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", flexShrink: 0, font: "inherit", fontSize: 9.5,
              letterSpacing: ".06em", padding: "1px 6px", textTransform: "uppercase",
            }}
          >
            Live
          </button>
          <input
            type="range"
            min={cursorNow - CURSOR_BACK_H * CURSOR_STEP}
            max={cursorNow + CURSOR_FWD_H * CURSOR_STEP}
            step={CURSOR_STEP}
            value={cursorMs}
            onChange={(e) => setCursorAt(new Date(Number(e.target.value)).toISOString())}
            aria-label="Time shown on this map"
            style={{ accentColor: "var(--accent)", flex: 1, height: 12, minWidth: 0 }}
          />
          <span style={{ color: cursorAt ? "var(--accent)" : "var(--muted)", flexShrink: 0, fontSize: 10, minWidth: 96, textAlign: "right", whiteSpace: "nowrap" }}>
            {cursorLabel}
          </span>
        </div>
        {/* The scale's own marks. Without them the handle is a position with
            no units — you can see that you moved, not to when. */}
        <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 44, paddingRight: 104 }}>
          {TICKS.map((t) => (
            <span key={t.at} style={{ color: "var(--faint)", fontSize: 8.5, whiteSpace: "nowrap" }}>
              {t.label}
            </span>
          ))}
        </div>
        {behind ? (
          <div style={{ color: "var(--warn)", fontSize: 9, paddingLeft: 44 }}>
            newest data {new Date(dataMs).toLocaleString([], { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : null}
      </div>
      )}
      {probe ? (
        <div
          style={{
            /*
              Placed by transform from the frame's top-left, never by left/top.
              A fixed box given a left/top near the right edge is shrink-wrapped
              into whatever room is left over there and every line of it wraps
              into a column — at the one moment somebody is reading it, and only
              ever at the right-hand edge. Laid out at the origin it takes its
              natural width first and is moved afterwards, and the capped width
              is what makes clamping it arithmetic rather than a guess.
            */
            position: "fixed",
            left: 0,
            top: 0,
            transform:
              "translate(" +
              Math.min(Math.max(probe.x, 92), Math.max(92, window.innerWidth - 92)) +
              "px, " +
              (probe.y > 96 ? probe.y - 14 : probe.y + 14) +
              "px) translate(-50%, " +
              (probe.y > 96 ? "-100%" : "0") +
              ")",
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,.45)",
            maxWidth: 180,
            padding: "7px 10px",
            pointerEvents: "none",
            zIndex: 60,
          }}
        >
          <div style={{ alignItems: "baseline", display: "flex", gap: 5 }}>
            <span style={{ color: "var(--ink)", fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>
              {probe.kind === "point"
                ? (typeof probe.value === "number" ? probe.value.toFixed(2) : "—")
                : probe.spd.toFixed(1)}
            </span>
            {/* Each layer's own unit. A single UNIT for both read "6.3 $/MWh"
                over a wind field on any map that also carried prices — the
                number was right and the label belonged to the other layer. */}
            <span style={{ color: "var(--faint)", fontSize: 11 }}>
              {probe.kind === "point" ? UNIT : FIELD ? FIELD.unit : UNIT}
            </span>
          </div>
          {probe.kind === "point" ? (
            // The node's own name, which is the thing being asked about — the
            // coordinate under a pin is the pin's, not a place worth stating,
            // and here it is invented anyway.
            <div style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
              {probe.id}
            </div>
          ) : (
            <>
              <div style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                from {CARDINALS[Math.round(((probe.dir + 360) % 360) / 22.5) % 16]}{" "}
                {Math.round((probe.dir + 360) % 360)}°
              </div>
              <div style={{ color: "var(--faint)", fontSize: 10, marginTop: 2, whiteSpace: "nowrap" }}>
                {Math.abs(probe.lat).toFixed(2)}°{probe.lat < 0 ? "S" : "N"}{" "}
                {Math.abs(probe.lon).toFixed(2)}°{probe.lon < 0 ? "W" : "E"}
              </div>
            </>
          )}
        </div>
      ) : null}

      {field && !NAKED && (
        <div style={{ alignItems: "center", background: "var(--bg)", borderRadius: 4, bottom: 4, display: "flex", gap: 6, left: 4, padding: "3px 6px", position: "absolute", zIndex: 2 }}>
          <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9 }}>
            {field.lo.toFixed(0)}
          </span>
          <span style={{ background: "linear-gradient(90deg,#2b6cb0,#6f8768,#d9a441,#c4703a)", borderRadius: 2, height: 5, width: 64 }} />
          <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9 }}>
            {field.hi.toFixed(0)} {FIELD.unit}
          </span>
        </div>
      )}

      {flights && !NAKED && (
        <div style={{ alignItems: "center", background: "var(--bg)", borderRadius: 4, display: "flex", gap: 7, padding: "3px 7px", position: "absolute", right: 4, top: 4, zIndex: 2 }}>
          <span style={{ color: "var(--ink)", fontFamily: "var(--mono)", fontSize: 10 }}>
            {flights.count} aircraft
          </span>
          {BANDS.map((b) => (
            <span key={b.id} style={{ alignItems: "center", display: "flex", gap: 3 }}>
              <span style={{ background: b.color, borderRadius: 2, height: 6, width: 6 }} />
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 8.5 }}>
                {b.max === Infinity ? "34k+" : (b.max / 1000) + "k"}
              </span>
            </span>
          ))}
        </div>
      )}

      ${
        /*
          The caveat is a caveat, not a caption — so it appears only when it is
          true. A located stream publishes where it measured, and stamping
          "approximate" across a map of published coordinates trains people to
          ignore the word on the maps where it matters.
        */
        /*
          Three states, three different claims. Invented positions get the loud
          dashed-blue MOCK treatment the catalogue uses everywhere else, because
          "these are not where this says they are" is not something a reader
          should have to infer from the word "approximate". A centroid is
          approximate. A published coordinate needs no caveat at all.

          It is the one thing `NAKED` keeps, because a preview that reads as
          real is the same lie a launched tile would be telling. With the
          scrubber gone it moves up into the corner the legend vacated —
          bottom-right out there is Mapbox's own attribution button.
        */
        invented || anyMock
          ? `<p style={{ background: "var(--color-info-dim)", border: "1px dashed var(--color-info-line)", borderRadius: 4, bottom: NAKED ? "auto" : 22, top: NAKED ? 4 : "auto", color: "var(--color-info)", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".08em", margin: 0, padding: "2px 6px", position: "absolute", right: 4, textTransform: "uppercase", zIndex: 2 }}>
        ${anyMock ? "Mock data · invented positions" : "Mock positions · not published"}
      </p>`
          : locatedRef || !nodes.length
            ? ""
            : `<p style={{ background: "var(--bg)", borderRadius: 4, bottom: NAKED ? "auto" : 4, top: NAKED ? 4 : "auto", color: "var(--faint)", fontSize: 10, margin: 0, padding: "2px 5px", position: "absolute", right: 4, zIndex: 2 }}>
        Approximate zone centroids
      </p>`
      }
    </Section>
  );
}`,
    };
  },
};

/**
 * Which column names an entity in this stream, and which names not to offer.
 *
 * Deliberately not `fanoutOf`. That one answers "is a stream-level chip a
 * chart of everything", which the big streams say no to on purpose — 1,118
 * settlement points is not a chart. It is exactly a search, though, so this
 * reads the map's own fallback chain (`entityColumn`, then `entityKey`, then
 * `node`) and asks only whether there is more than one name to choose
 * between.
 */
function searchable(
  ref: DataRef,
): { key: string; omit: string[]; only?: string[] } | null {
  if (ref.kind === "entity" || ref.kind === "query") return null;
  const schema = schemaFor(ref.schemaId);
  if (!schema) return null;
  const key =
    schema.entityColumn ?? schema.entityKey ?? "node";
  if (ref.subset?.entities.length)
    return {
      key,
      omit: schema.entityOmit ?? [],
      only: ref.subset.entities,
    };
  return schema.entities.count > 1
    ? { key, omit: schema.entityOmit ?? [] }
    : null;
}

/**
 * A search over one stream's entities, driving the tiles wired to it.
 *
 * The map was the only source a wire could have, which made "click a node"
 * the only way to retarget a chart — fine for three dozen hubs on a map,
 * useless for a screen with no room for one and worse for 1,118 settlement
 * points three pixels across. Typing a name is the other half of the same
 * gesture, and it is the half that scales.
 *
 * **The list is the stream's own answer, not a declaration.** It queries the
 * newest interval without an entity filter and reads the names off the rows —
 * the same discovery a fan-out does — so an entity the source adds next year
 * appears in the search without this page being recomposed, and a name that
 * has gone quiet stops being offered.
 */
const picker: ComponentDef = {
  kind: "picker",
  name: "Node search",
  blurb:
    "Search one stream's entities and pick one; every tile wired to it retargets.",
  options: [
    {
      key: "sort",
      label: "Order",
      choices: [
        { value: "name", label: "A to Z" },
        { value: "value", label: "Largest value first" },
      ],
      fallback: "name",
    },
    {
      key: "clear",
      label: "Allow clearing",
      choices: [
        { value: "yes", label: "Yes — back to the default" },
        { value: "no", label: "No" },
      ],
      fallback: "yes",
    },
  ],
  /*
    One stream, and a stream with entities in it. An entity-level chip is one
    name, which is a search with a single answer; two streams is two lists,
    and a pick out of one of them means nothing to the other.
  */
  accepts: (refs) => {
    if (refs.length !== 1)
      return {
        ok: false,
        why:
          refs.length === 0
            ? "Pick one stream."
            : "A search reads one stream's entities.",
      };
    return searchable(refs[0])
      ? { ok: true }
      : {
          ok: false,
          why: "This selection is a single series — there is nothing to search between.",
        };
  },
  // Anywhere it cannot search it is not a rejected search, it is an answer to
  // a question nobody asked.
  offered: (refs) =>
    refs.length === 1 && searchable(refs[0]) !== null,
  emit(refs, i, o) {
    const fan = searchable(refs[0])!;
    const s = series(refs);
    const name = `Picker${i}`;
    const schema = schemaFor(refs[0].schemaId);
    /*
      One interval's worth of rows, bounded at now for the same reason the map
      is: a forecast's newest row is days out, and a search listing next
      Sunday's names would be wrong in a way nobody would catch by reading it.
    */
    const limit = Math.min(
      DRAW_CAP,
      fan.only
        ? Math.max(30, fan.only.length * 2)
        : Math.max(60, (schema?.entities.count ?? 50) * 2),
    );
    const title = schema?.name ?? s[0]?.label ?? "Search";
    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const queries = ${JSON.stringify([
    {
      dataset: s[0].dataset,
      ...(fan.only ? { node: fan.only } : {}),
      end: "-0m",
      limit,
    },
  ])};
  const { rows, error, loading } = useSeries(queries, ${refreshMs(refs)});

  const ENTITY = ${JSON.stringify(fan.key)};
  const OMIT = ${JSON.stringify(fan.omit)};
  const ONLY = ${JSON.stringify(fan.only ?? null)};
  const COLUMN = ${JSON.stringify(s[0].column)};
  const BY_VALUE = ${o.sort === "value"};
  const CLEARABLE = ${o.clear !== "no"};

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  /*
    The names, read off the rows rather than declared, newest first so the
    value beside each is the current one. Typing filters this list locally —
    a keystroke that costs a query is a search that stutters at exactly the
    speed somebody types.
  */
  const items = useMemo(() => {
    const best = new Map();
    (rows[0] || []).forEach((r) => {
      const e = r[ENTITY];
      if (e == null) return;
      const n = String(e);
      if (OMIT.indexOf(n) !== -1) return;
      if (ONLY && ONLY.indexOf(n) === -1) return;
      if (!best.has(n)) best.set(n, r[COLUMN]);
    });
    const list = [...best].map(([n, v]) => ({ name: n, value: v }));
    list.sort((a, b) =>
      BY_VALUE
        ? (Number(b.value) || 0) - (Number(a.value) || 0)
        : a.name.localeCompare(b.name),
    );
    return list;
  }, [rows]);

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? items.filter((x) => x.name.toLowerCase().indexOf(t) !== -1)
      : items;
    return list.slice(0, 300);
  }, [items, q]);

  /* The wire's own channel, the same one a map click travels on. */
  function send(n) {
    setSel(n);
    window.dispatchEvent(new CustomEvent("dryos:pick", { detail: { source: ${i}, entity: n } }));
  }

  return (
    <Section index={${i}} w={w} h={h} title=${JSON.stringify(title)} loading={loading} error={error}>
      <div style={{ background: "var(--surface)", paddingBottom: 6, position: "sticky", top: 0, zIndex: 2 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={"Search " + items.length + " …"}
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", fontFamily: "inherit", fontSize: 12, outline: "none", padding: "6px 8px", width: "100%" }}
        />
        {sel && (
          <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 6 }}>
            <span style={{ border: "1px solid var(--accent)", borderRadius: 4, color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", padding: "1px 5px", textTransform: "uppercase" }}>⌁ {sel}</span>
            {CLEARABLE && (
              <button
                onClick={() => { setSel(null); window.dispatchEvent(new CustomEvent("dryos:pick", { detail: { source: ${i}, entity: null } })); }}
                style={{ background: "transparent", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 11, padding: 0 }}
              >
                clear
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {hits.map((x) => (
          <button
            key={x.name}
            onClick={() => send(x.name)}
            style={{
              alignItems: "center",
              background: x.name === sel ? "var(--accent-dim)" : "transparent",
              border: "1px solid " + (x.name === sel ? "var(--accent)" : "transparent"),
              borderRadius: 5,
              color: "var(--ink)",
              cursor: "pointer",
              display: "flex",
              fontFamily: "inherit",
              fontSize: 12,
              gap: 8,
              padding: "4px 6px",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
            {x.value != null && (
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                {Number(x.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </button>
        ))}
        {hits.length === 0 && !loading && (
          <p style={{ color: "var(--faint)", fontSize: 11.5, margin: "6px 2px" }}>
            {items.length === 0 ? "No entities in the newest interval." : "Nothing matches that."}
          </p>
        )}
      </div>
    </Section>
  );
}
`,
    };
  },
};

export const COMPONENTS: ComponentDef[] = [
  chart,
  scatter,
  distribution,
  bar,
  heatmap,
  ticker,
  table,
  map,
  picker,
];

export function componentDef(
  kind: ComponentKind,
): ComponentDef | undefined {
  return COMPONENTS.find((c) => c.kind === kind);
}

/**
 * How big a tile arrives.
 *
 * Small on purpose — half the width, short — because the point is that you drag
 * its corner to the size that suits the dashboard. A component that lands
 * full-bleed has already made the decision for you.
 */
export const DEFAULT_LAYOUT: Record<
  ComponentKind,
  NonNullable<ComponentSpec["layout"]>
> = {
  chart: { w: 6, h: 240 },
  scatter: { w: 5, h: 260 },
  distribution: { w: 5, h: 240 },
  bar: { w: 4, h: 220 },
  heatmap: { w: 6, h: 280 },
  ticker: { w: 3, h: 150 },
  table: { w: 6, h: 260 },
  map: { w: 6, h: 300 },
  picker: { w: 3, h: 260 },
};

/** The canvas: twelve columns, a 12px gutter, and 10px of vertical travel. */
export const GRID = {
  cols: 12,
  gap: 12,
  snap: 10,
} as const;

/** A tile's rectangle once it has one: columns across, pixels down. */
export type Placed = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** Do two tiles share any ground? Half-open on both axes. */
export function overlaps(a: Placed, b: Placed): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

/** The first free pixel below everything already on the canvas. */
export function below(manifest: ComponentSpec[]): number {
  return manifest.reduce((m, spec) => {
    const l = spec.layout;
    if (typeof l?.y !== "number") return m;
    return Math.max(m, l.y + l.h);
  }, 0);
}

/**
 * Give every tile an explicit place, without moving one that already has one.
 *
 * Every write goes through this, and that is the point: the first time anyone
 * touches a page written before positions existed, the arrangement it had is
 * frozen into the manifest exactly as the old flow grid drew it — same order,
 * same wrap, same row heights — and from then on nothing is derived from a
 * neighbour. A page that has never been rearranged therefore looks identical
 * after this change, which is the only acceptable migration for someone's
 * screen.
 */
export function packLayout(
  manifest: ComponentSpec[],
): ComponentSpec[] {
  const size = manifest.map((spec) => ({
    w: clamp(Math.round(spec.layout?.w ?? 6), 1, GRID.cols),
    h: Math.max(120, Math.round(spec.layout?.h ?? 240)),
  }));

  // Everything that already has a place keeps it, and keeps it first: a page
  // caught mid-migration has both kinds in it, and the tile somebody put
  // somewhere is the one the others have to be laid around — not the reverse.
  const at: (Placed | null)[] = manifest.map((spec, i) => {
    const { x, y } = spec.layout ?? {};
    if (typeof x !== "number" || typeof y !== "number")
      return null;
    return {
      x: clamp(Math.round(x), 0, GRID.cols - size[i].w),
      y: Math.max(0, Math.round(y)),
      ...size[i],
    };
  });
  const taken: Placed[] = at.filter(
    (p): p is Placed => p !== null,
  );

  // The old grid's own rule for the rest: fill the row, wrap when the span no
  // longer fits, and start the next row below the tallest tile in this one.
  let col = 0;
  let top = 0;
  let rowH = 0;
  manifest.forEach((_, i) => {
    if (at[i]) return;
    const { w, h } = size[i];
    if (col + w > GRID.cols) {
      col = 0;
      top += rowH + GRID.gap;
      rowH = 0;
    }
    const box: Placed = { x: col, y: top, w, h };
    while (taken.some((t) => overlaps(box, t)))
      box.y += GRID.snap;
    col += w;
    rowH = Math.max(rowH, h);
    taken.push(box);
    at[i] = box;
  });

  return manifest.map((spec, i) => ({
    ...spec,
    layout: at[i]!,
  }));
}
