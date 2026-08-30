import { type DataRef, schemaFor } from "./catalog";
import { ERCOT_POINTS, ERCOT_VIEW, hasGeography } from "./geo";
import { schemaById } from "./catalog";

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

export type ComponentKind = "chart" | "bar" | "heatmap" | "ticker" | "table" | "map";

export interface ComponentSpec {
  kind: ComponentKind;
  refs: DataRef[];
  /** Settings chosen in the builder. Missing keys fall back to the default. */
  options?: Record<string, string>;
  /**
   * Where it sits on the canvas: `w` columns out of twelve, `h` in pixels.
   *
   * A dropped tile arrives deliberately small and is resized by dragging its
   * corner. Sizing a component is a judgement about the dashboard around it, not
   * about the component, so it is not something a generator can guess.
   */
  layout?: { w: number; h: number };
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
  accepts: (refs: DataRef[]) => { ok: boolean; why?: string };
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

/** Chosen values on top of the defaults, so a generator can read `o.key` flatly. */
export function withDefaults(
  def: ComponentDef,
  options?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of def.options) out[o.key] = options?.[o.key] ?? o.fallback;
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
  return schema?.variables.find((v) => v.key === key)?.unit ?? "";
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
function slowFill(refs: DataRef[], s: { key: string }[]): string {
  const cadences = refs.map((r) => r.cadenceSeconds);
  const finest = Math.min(...cadences);
  const slow = s.filter((_, i) => cadences[i] > finest).map((x) => x.key);
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
  const fastest = Math.min(...refs.map((r) => r.cadenceSeconds));
  return Math.max(15_000, Math.min(fastest, 900) * 1000);
}

function series(refs: DataRef[]) {
  const streams = new Set(refs.map((r) => r.schemaId));
  return refs.map((r, i) => {
    const n = node(r);
    // An entity-picked ref is already named by its entity; repeating it as
    // "HB_NORTH · HB_NORTH" would be a stutter.
    const base = n && n !== r.label ? `${r.label} · ${n}` : r.label;
    // Two streams can price the same entity — RT and DAM both quote
    // HB_NORTH — and a tooltip with two identical labels compares nothing.
    const stream = schemaFor(r.schemaId)?.name;
    return {
      key: `s${i}`,
      dataset: target(r),
      node: n ?? schemaFor(r.schemaId)?.entities.sample[0] ?? "",
      column: column(r),
      unit: unit(r),
      label: streams.size > 1 && stream ? `${base} — ${stream}` : base,
      mock: r.availability === "mock",
    };
  });
}

/*
  The eight series slots the frame's palette defines (`runtime.ts`), in their
  fixed order. Fixed is the point: a colour follows the entity it was assigned
  to at selection time, never its rank, and the sequence itself is what was
  validated for colour-vision safety. Never cycle past the end — `accepts`
  caps every shape at eight or fewer first. (This replaces the old four-slot
  list whose fourth entry was `var(--stale)`, a token no palette defined — the
  fourth series has been drawing in black since the day it shipped.)
*/
const PALETTE = [
  "var(--s1)",
  "var(--s2)",
  "var(--s3)",
  "var(--s4)",
  "var(--s5)",
  "var(--s6)",
  "var(--s7)",
  "var(--s8)",
];

/** One unit across the selection, or null when they mix. */
function uniformUnit(refs: DataRef[]): string | null {
  const units = [...new Set(refs.map(unit))];
  return units.length === 1 ? units[0] : null;
}

/**
 * What a tile is called. Up to three series, their labels fit in a title;
 * past that the stream's own name says it better than a five-label pile-up.
 */
function titleFor(refs: DataRef[], s: { label: string }[]): string {
  if (refs.length > 3) {
    return schemaFor(refs[0].schemaId)?.name ?? s.map((x) => x.label).join(" · ");
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
function fanoutOf(ref: DataRef): { key: string; omit: string[] } | null {
  if (ref.kind === "entity" || ref.kind === "query") return null;
  const schema = schemaFor(ref.schemaId);
  if (!schema?.entityKey) return null;
  return { key: schema.entityKey, omit: schema.entityOmit ?? [] };
}

const WINDOW_SECONDS: Record<string, number> = {
  "-6h": 21_600,
  "-24h": 86_400,
  "-7d": 604_800,
};

/** Enough rows for every entity across the window, within the route's cap. */
function fanoutLimit(window: string, cadenceSeconds: number): number {
  const span = WINDOW_SECONDS[window] ?? 86_400;
  return Math.min(10_000, Math.ceil(span / Math.max(cadenceSeconds, 60)) * 10);
}

/** Rendered beside anything drawn from a schema with no collector. */
function mockTag(any: boolean): string {
  return any
    ? `        <span style={{ border: "1px dashed var(--info)", borderRadius: 3, color: "var(--info)", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".1em", padding: "0 4px", textTransform: "uppercase" }}>mock</span>\n`
    : "";
}

/* ── The shapes ───────────────────────────────────────────────────────── */

const chart: ComponentDef = {
  kind: "chart",
  name: "Chart",
  blurb: "A time series per selection, hoverable, on one set of axes.",
  options: [
    { key: "window", label: "Window", choices: WINDOWS, fallback: "-24h" },
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
        ? { ok: false, why: "Eight series is the most one chart reads well." }
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
    const stacked = o.shape === "stacked";
    const area = o.shape === "area";
    const Wrap = stacked || area ? "AreaChart" : "LineChart";
    const fan = refs.length === 1 ? fanoutOf(refs[0]) : null;
    // The spread only means anything for exactly two series; any other count
    // quietly draws them separately rather than failing a shape that renders.
    const spread = o.combine === "spread" && !fan && s.length === 2;
    const title = spread
      ? `${s[0].label} − ${s[1].label}`
      : fan
        ? (schemaFor(refs[0].schemaId)?.name ?? s[0].label)
        : titleFor(refs, s);
    // A day of a five-minute feed is 288 rows; a week is 2,016 — and a
    // fanned-out stream multiplies that by its entities. The limit follows
    // the window instead of quietly truncating the long one.
    const limit = fan
      ? fanoutLimit(o.window, refs[0].cadenceSeconds)
      : o.window === "-7d"
        ? 2000
        : 500;
    // Hours carry a day of context; a week needs dates.
    const tickFmt =
      o.window === "-7d"
        ? "(t) => new Date(t).toISOString().slice(5, 10)"
        : "(t) => new Date(t).toISOString().slice(11, 16)";
    // A fanned-out chart is always several series, whatever its shape, so it
    // always carries the legend.
    const legend = stacked || fan;

    const queries = fan
      ? [{ dataset: s[0].dataset, start: o.window, limit }]
      : s.map((x) => ({ dataset: x.dataset, node: x.node, start: o.window, limit }));

    const setup = fan
      ? `
  const ENTITY = ${JSON.stringify(fan.key)};
  const OMIT = ${JSON.stringify(fan.omit)};
  const COLUMN = ${JSON.stringify(s[0].column)};

  /*
    Pivot: one point per interval, one key per entity, discovered from the
    rows rather than declared — an entity the source adds next year appears
    without this page being recomposed. Colour slots go by alphabetical
    entity name, so a reload never repaints anyone; past eight entities the
    eight largest keep the chart and the rest wait for a second tile.
  */
  const { merged, names } = React.useMemo(() => {
    const by = new Map();
    const size = new Map();
    (rows[0] || []).forEach((r) => {
      const e = r[ENTITY];
      if (e == null || OMIT.includes(e)) return;
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
    s.map((x, n) => ({ key: x.key, label: x.label, color: PALETTE[n % PALETTE.length] })),
  )};`
    : ""
}`;

    // Stack order is decided from the data: the biggest series goes to the
    // bottom. Colours ride with the series, never with the position.
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
          ? // The surface-coloured stroke is the gap between stacked
            // segments, so adjacent fills never touch — identity is never
            // colour alone.
            `{ordered.map((sr) => (
            <Area key={sr.key} type="monotone" stackId="a" dataKey={sr.key} name={sr.label} stroke="var(--surface)" strokeWidth={1} fill={sr.color} fillOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
          ))}`
          : `{ordered.map((sr) => (
            <${area ? "Area" : "Line"} key={sr.key} type="monotone" dataKey={sr.key} name={sr.label} stroke={sr.color} ${area ? "fill={sr.color} fillOpacity={0.12} " : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
          ))}`
        : spread
          ? `<${area ? "Area" : "Line"} type="monotone" dataKey="sd" name=${JSON.stringify(title)} stroke="${PALETTE[0]}" ${area ? `fill="${PALETTE[0]}" fillOpacity={0.12} ` : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`
          : s
            .map(
              (x, n) =>
                `<${area ? "Area" : "Line"} type="monotone" dataKey="${x.key}" name=${JSON.stringify(x.label)} stroke="${PALETTE[n % PALETTE.length]}" ${area ? `fill="${PALETTE[n % PALETTE.length]}" fillOpacity={0.12} ` : ""}strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />`,
            )
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
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(queries, null, 2).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );
${setup}
${orderMemo}
  return (
    <Section index={${i}} w={w} h={h} fill title=${JSON.stringify(title)} unit=${JSON.stringify(s[0].unit)} loading={loading} error={error}>
${mockTag(anyMock)}      <div style={{ inset: 0, position: "absolute" }}>
      <ResponsiveContainer width="100%" height="100%">
        <${Wrap} data={merged} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={${tickFmt}}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
          />
          <YAxis tick={{ fill: "var(--faint)", fontSize: 11 }} stroke="var(--line)" tickLine={false} width={52} />
          <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />
          <Tooltip content={<ChartTip unit=${JSON.stringify(s[0].unit)} />} />
${
  legend
    ? `          <Legend wrapperStyle={{ fontSize: 10.5, color: "var(--muted)" }} iconSize={9} />
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
        ? { ok: false, why: "One value is a ticker — add a second series to compare." }
        : refs.length > 8
          ? { ok: false, why: "Eight bars is the most one chart compares well." }
          : uniformUnit(refs) === null
            ? { ok: false, why: "Bars compare one unit; these mix units." }
            : { ok: true },
  // Beside a single selection a bar is not a rejected bar, it is a ticker —
  // unless the selection is a whole stream, which fans out into a bar per
  // entity and is exactly what this shape is for.
  offered: (refs) => refs.length !== 1 || fanoutOf(refs[0]) !== null,
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Bar${i}`;
    const fan = refs.length === 1 ? fanoutOf(refs[0]) : null;
    const title = fan
      ? (schemaFor(refs[0].schemaId)?.name ?? s[0].label)
      : titleFor(refs, s);
    const horizontal = o.orient === "h";

    const queries = fan
      ? // Two intervals' worth of rows covers every entity even when the
        // newest interval is still filling in.
        [{ dataset: s[0].dataset, limit: 24 }]
      : s.map((x) => ({ dataset: x.dataset, node: x.node, limit: 1 }));

    const dataMemo = fan
      ? `
  const ENTITY = ${JSON.stringify(fan.key)};
  const OMIT = ${JSON.stringify(fan.omit)};
  const COLUMN = ${JSON.stringify(s[0].column)};

  // Rows arrive newest-first, so the first row per entity is its latest
  // value. Colour slots go by alphabetical entity name — stable across
  // reloads and untouched by the sort below.
  const data = React.useMemo(() => {
    const latest = new Map();
    (rows[0] || []).forEach((r) => {
      const e = r[ENTITY];
      if (e == null || OMIT.includes(e) || latest.has(e)) return;
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
  // The entity is the bar's name; colour was assigned at selection time and
  // rides with the entity through any sort, never with its rank.
  const SERIES = ${JSON.stringify(
    s.map((x, n) => ({
      name: x.node || x.label,
      full: x.label,
      column: x.column,
      color: PALETTE[n % PALETTE.length],
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
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
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
  blurb: "Hour of day against day — where in the day a series lives.",
  options: [
    {
      key: "days",
      label: "Days",
      choices: [
        { value: "7", label: "7 days" },
        { value: "14", label: "14 days" },
        { value: "30", label: "30 days" },
      ],
      fallback: "14",
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
        ? { ok: false, why: "A heatmap grids one series — hour by day." }
        : fanoutOf(refs[0])
          ? { ok: false, why: "Pick a single entity, not the whole stream." }
          : refs[0].cadenceSeconds > 3600
            ? { ok: false, why: "Needs an intraday series — a daily one has no hours to grid." }
            : { ok: true },
  // Beside several series a heatmap is not a rejected heatmap; the selection
  // has simply moved past it, the same way it moves past the ticker.
  offered: (refs) => refs.length <= 1,
  emit(refs, i, o) {
    const s = series(refs);
    const anyMock = s.some((x) => x.mock);
    const name = `Heatmap${i}`;
    const days = Number(o.days) || 14;
    // A month of a five-minute feed is ~8,640 rows; the route caps at 10k.
    const limit = Math.min(10_000, Math.ceil((days * 86_400) / Math.max(refs[0].cadenceSeconds, 60)) + 48);

    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    [{ dataset: ${JSON.stringify(s[0].dataset)}, node: ${JSON.stringify(s[0].node)}, start: "-${days}d", limit: ${limit} }],
    ${refreshMs(refs)},
  );

  const COLUMN = ${JSON.stringify(s[0].column)};
  const UNIT = ${JSON.stringify(s[0].unit)};
  const AGG = ${JSON.stringify(o.agg)};

  /*
    Bucketed in Central time, because "hour of day" is a claim about when
    Texans were using power, not about UTC. Intl does the DST arithmetic.
  */
  const grid = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false,
    });
    const cells = new Map();
    (rows[0] || []).forEach((r) => {
      const v = r[COLUMN];
      if (typeof v !== "number") return;
      const parts = fmt.formatToParts(new Date(r.interval_start_utc));
      const get = (t) => (parts.find((p) => p.type === t) || {}).value;
      const day = get("year") + "-" + get("month") + "-" + get("day");
      const hour = Number(get("hour")) % 24;
      const d = cells.get(day) || {};
      const c = d[hour] || { sum: 0, n: 0, max: -Infinity };
      c.sum += v; c.n += 1; c.max = Math.max(c.max, v);
      d[hour] = c;
      cells.set(day, d);
    });
    const val = (c) => (AGG === "max" ? c.max : c.sum / c.n);
    const daysList = [...cells.keys()].sort().reverse();
    let lo = Infinity, hi = -Infinity;
    daysList.forEach((day) => {
      const d = cells.get(day);
      for (const hKey in d) { const x = val(d[hKey]); if (x < lo) lo = x; if (x > hi) hi = x; }
    });
    return { daysList, cells, lo, hi, val };
  }, [rows]);

  const HOURS = Array.from({ length: 24 }, (_, hIdx) => hIdx);
  const [hover, setHover] = React.useState(null);

  /*
    Ours, not the browser's. title= waits about a second before it appears,
    draws in the OS's colours — near-white on a dark grid — and can only say one
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
    const day = el.dataset.day;
    const hr = Number(el.dataset.hr);
    setHover((prev) => {
      if (prev && prev.day === day && prev.hour === hr) return prev;
      const r = el.getBoundingClientRect();
      return { day, hour: hr, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    });
  };

  const hc = hover ? (grid.cells.get(hover.day) || {})[hover.hour] : null;
  const pad2 = (n) => String(n).padStart(2, "0");
  // Prices want cents; load does not want four digits of them.
  const num = (v) =>
    Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);

  return (
    <Section index={${i}} w={w} h={h} title=${JSON.stringify(s[0].label)} unit={UNIT} loading={loading} error={error}>
${mockTag(anyMock)}      <div
        onMouseMove={track}
        onMouseLeave={() => setHover(null)}
        style={{ display: "grid", gap: 2, gridTemplateColumns: "auto repeat(24, 1fr)", fontFamily: "var(--mono)", fontSize: 9 }}
      >
        <span />
        {HOURS.map((hr) => (
          <span key={hr} style={{ color: hover && hover.hour === hr ? "var(--ink)" : "var(--faint)", textAlign: "center" }}>
            {hr % 3 === 0 || (hover && hover.hour === hr) ? hr : ""}
          </span>
        ))}
        {grid.daysList.map((day) => (
          <React.Fragment key={day}>
            <span style={{ alignSelf: "center", color: hover && hover.day === day ? "var(--ink)" : "var(--faint)", paddingRight: 4 }}>{day.slice(5)}</span>
            {HOURS.map((hr) => {
              const c = (grid.cells.get(day) || {})[hr];
              if (!c) return <span key={hr} style={{ background: "var(--surface-2)", borderRadius: 2, minHeight: 16 }} />;
              const x = grid.val(c);
              const t = grid.hi > grid.lo ? (x - grid.lo) / (grid.hi - grid.lo) : 0.5;
              const on = hover && hover.day === day && hover.hour === hr;
              return (
                <span
                  key={hr}
                  data-cell=""
                  data-day={day}
                  data-hr={hr}
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
            {pad2(hover.hour)}:00 – {pad2((hover.hour + 1) % 24)}:00 CT
          </div>
          <div style={{ color: "var(--ink)", fontSize: 17, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {num(grid.val(hc))}
            <span style={{ color: "var(--faint)", fontSize: 11, fontWeight: 400 }}> {UNIT}</span>
          </div>
          <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
            {new Date(hover.day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
            {" · " + hc.n + (hc.n === 1 ? " interval" : " intervals")}
            {/* The aggregate not on show above: an hour's peak is the question
                an average invites, and the reverse. */}
            {hc.n > 1 ? (AGG === "max" ? " · avg " + num(hc.sum / hc.n) : " · peak " + num(hc.max)) : ""}
          </div>
        </div>
      ) : null}
      <p style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9.5, margin: "6px 0 0" }}>
        {grid.lo === Infinity ? "no data yet" : grid.lo.toFixed(1) + " – " + grid.hi.toFixed(1) + " " + UNIT + " · " + (AGG === "max" ? "peak" : "average") + " per hour · Central time"}
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
    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const { rows, error, loading } = useSeries(
    ${JSON.stringify(
      s.map((x) => ({
        dataset: x.dataset,
        node: x.node,
        start: "-2h",
        limit: 2,
      })),
      null,
      2,
    ).replace(/\n/g, "\n    ")},
    ${refreshMs(refs)},
  );

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
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase" }}>{c.label}</span>
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
    { key: "window", label: "Window", choices: WINDOWS, fallback: "-6h" },
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
    refs.length === 0 ? { ok: false, why: "Pick a series." } : { ok: true },
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
              <th>Interval</th>
              {cols.map((c) => (
                <th key={c.label} style={{ textAlign: "right" }}>{c.label} {c.unit && "(" + c.unit + ")"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {merged.map((r) => (
              <tr key={r.t}>
                <td style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  {new Date(r.t).toISOString().slice(11, 16)}Z
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
    "Selections placed on Texas, sized and coloured by their newest value.",
  options: [
    {
      key: "style",
      label: "Base map",
      choices: [
        { value: "auto", label: "Match theme" },
        { value: "dark-v11", label: "Dark" },
        { value: "light-v11", label: "Light" },
        { value: "satellite-streets-v12", label: "Satellite" },
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
        { value: "heatmap", label: "Heatmap" },
        { value: "cells", label: "Shaded cells" },
        { value: "off", label: "Off" },
      ],
      fallback: "heatmap",
    },
  ],
  accepts(refs) {
    /*
      Three ways to be mappable, and only one of them needs a lookup table.

      A gridded field and a moving fleet both carry their own position — the
      grid in its cell id, the fleet in every row — so neither is asked whether
      we happen to know where its entities are. Only named places are, and for
      those the answer really is no when we do not.
    */
    const hasField = refs.some((r) => schemaById(r.schemaId)?.field);
    const hasMotion = refs.some((r) => schemaById(r.schemaId)?.motion);

    if (refs.length === 0) return { ok: false, why: "Pick a series." };
    if (hasField || hasMotion) return { ok: true };

    const nodes = refs.flatMap((r) => {
      const n = node(r);
      return n ? [n] : (schemaFor(r.schemaId)?.entities.sample ?? []);
    });
    return hasGeography(nodes)
      ? { ok: true }
      : { ok: false, why: "None of those have a known location." };
  },

  emit(refs, i, o) {
    const name = `Map${i}`;

    // Two kinds of reference, two treatments. A gridded schema becomes a
    // surface; everything else stays a labelled pin.
    const fieldRef = refs.find((r) => schemaById(r.schemaId)?.field);
    const motionRef = refs.find((r) => schemaById(r.schemaId)?.motion);
    const pointRefs = refs.filter(
      (r) => !schemaById(r.schemaId)?.field && !schemaById(r.schemaId)?.motion,
    );
    const s = series(pointRefs.length ? pointRefs : refs);

    const nodes = [
      ...new Set(
        pointRefs.flatMap((r) => {
          const n = node(r);
          if (n) return [n];
          const sample = schemaFor(r.schemaId)?.entities.sample ?? [];
          return Object.keys(ERCOT_POINTS).filter(
            (k) =>
              sample.includes(k) ||
              k.startsWith(sample[0]?.slice(0, 3) ?? "\u00a7"),
          );
        }),
      ),
    ].filter((n) => n in ERCOT_POINTS);

    const points = Object.fromEntries(nodes.map((n) => [n, ERCOT_POINTS[n]]));
    const anyMock = refs.some((r) => r.availability === "mock");
    const showField = Boolean(fieldRef) && o.field !== "off";

    const fieldSchema = fieldRef ? schemaById(fieldRef.schemaId) : undefined;
    const fieldColumn = fieldRef ? column(fieldRef) : "";
    const fieldUnit = fieldRef ? unit(fieldRef) : "";
    const fieldDataset = fieldSchema?.dataset ?? fieldSchema?.id ?? "";

    const motionSchema = motionRef ? schemaById(motionRef.schemaId) : undefined;
    const motionDataset = motionSchema?.dataset ?? motionSchema?.id ?? "";
    const trails = o.trails !== "off";
    // Enough readings back to draw a tail without hauling a history nobody sees.
    const motionLimit = trails ? 14 : 1;

    return {
      imports: [],
      code: `function ${name}({ w, h }) {
  const POINTS = ${JSON.stringify(points, null, 2).replace(/\n/g, "\n  ")};
  const NODES = Object.keys(POINTS);
  const COLUMN = ${JSON.stringify(s[0]?.column ?? "")};
  const UNIT = ${JSON.stringify(s[0]?.unit ?? "")};
  const STYLE = ${JSON.stringify(o.style)};
  const FIELD = ${showField ? JSON.stringify({ dataset: fieldDataset, column: fieldColumn, unit: fieldUnit, mode: o.field, label: fieldRef!.label }) : "null"};
  const MOTION = ${motionRef ? JSON.stringify({ dataset: motionDataset, trails, label: motionRef.label }) : "null"};

  const { rows, error, loading } = useSeries(
    [
${nodes.length ? `      { dataset: ${JSON.stringify(s[0]?.dataset ?? "")}, node: NODES, limit: 1 },` : ""}
${showField ? `      { dataset: ${JSON.stringify(fieldDataset)}, start: "-1h", limit: 1 },` : ""}
${motionRef ? `      { dataset: ${JSON.stringify(motionDataset)}, start: "-30m", limit: ${motionLimit} },` : ""}
    ],
    ${refreshMs(refs)},
  );

  const pointRows = ${nodes.length ? "rows[0] || []" : "[]"};
  const fieldRows = ${showField ? `rows[${nodes.length ? 1 : 0}] || []` : "[]"};
  const flightRows = ${motionRef ? `rows[${(nodes.length ? 1 : 0) + (showField ? 1 : 0)}] || []` : "[]"};

  const ready = useMapbox();
  const theme = useFrameTheme();
  const style = STYLE === "auto" ? (theme === "light" ? "light-v11" : "dark-v11") : STYLE;

  const host = React.useRef(null);
  const map = React.useRef(null);
  const markers = React.useRef([]);

  const latest = React.useMemo(() => {
    const out = {};
    pointRows.forEach((r) => { out[r.node] = r[COLUMN]; });
    return out;
  }, [rows]);

  /*
    A grid cell carries its own position: G_315_1005 is 31.5N 100.5W. Encoding
    it in the id means no lookup table has to travel with the data.
  */
  const field = React.useMemo(() => {
    if (!FIELD) return null;
    const features = [];
    let lo = Infinity, hi = -Infinity;
    fieldRows.forEach((r) => {
      const m = /^G_(\\d+)_(\\d+)$/.exec(r.node);
      const v = r[FIELD.column];
      if (!m || typeof v !== "number") return;
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

  React.useEffect(() => {
    if (!ready || !host.current || map.current) return;
    map.current = new window.mapboxgl.Map({
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
    if (!m || !field) return;

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
  }, [field, ready, style]);

  /*
    Aircraft, drawn the way every tracker draws them.

    A symbol layer rather than DOM markers: the icon rotates with
    \`icon-rotate\` straight from the track angle, it is GPU-drawn so a few
    hundred aeroplanes cost nothing, and overlap is allowed because two
    aeroplanes near each other is information rather than clutter.

    Colour is by barometric altitude, which is the convention — low is warm and
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
    if (!m || !flights) return;

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
  }, [flights, ready, style]);

  // Redrawn rather than mutated: a handful of markers is cheaper to replace
  // than to diff, and the value changes on every poll anyway.
  React.useEffect(() => {
    if (!map.current || !window.mapboxgl) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];

    const values = NODES.map((n) => latest[n]).filter((v) => typeof v === "number");
    if (!values.length) return;
    const lo = Math.min(...values);
    const hi = Math.max(...values);

    NODES.forEach((n) => {
      const v = latest[n];
      if (typeof v !== "number") return;
      const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
      const el = document.createElement("div");
      el.style.cssText =
        "align-items:center;background:" + (t > 0.66 ? "var(--warn)" : t > 0.33 ? "var(--accent)" : "var(--info)") +
        ";border:1px solid rgba(0,0,0,.45);border-radius:999px;color:#0d1206;display:flex;font:600 10px/1 ui-sans-serif,system-ui;" +
        "height:" + (22 + t * 16) + "px;justify-content:center;width:" + (22 + t * 16) + "px;";
      el.textContent = v.toFixed(0);
      const popup = new window.mapboxgl.Popup({ offset: 14 }).setText(
        POINTS[n].label + " — " + v.toFixed(2) + " " + UNIT + " (approximate location)"
      );
      markers.current.push(
        new window.mapboxgl.Marker({ element: el })
          .setLngLat([POINTS[n].lon, POINTS[n].lat])
          .setPopup(popup)
          .addTo(map.current)
      );
    });
  }, [latest, ready, style]);

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
      <div ref={host} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 6, inset: 0, position: "absolute" }} />

      {field && (
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

      {flights && (
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

      <p style={{ background: "var(--bg)", borderRadius: 4, bottom: 4, color: "var(--faint)", fontSize: 10, margin: 0, padding: "2px 5px", position: "absolute", right: 4, zIndex: 2 }}>
        ${anyMock ? "Mock field · approximate positions" : "Approximate zone centroids"}
      </p>
    </Section>
  );
}`,
    };
  },
};

export const COMPONENTS: ComponentDef[] = [chart, bar, heatmap, ticker, table, map];

export function componentDef(kind: ComponentKind): ComponentDef | undefined {
  return COMPONENTS.find((c) => c.kind === kind);
}

/**
 * How big a tile arrives.
 *
 * Small on purpose — half the width, short — because the point is that you drag
 * its corner to the size that suits the dashboard. A component that lands
 * full-bleed has already made the decision for you.
 */
export const DEFAULT_LAYOUT: Record<ComponentKind, { w: number; h: number }> = {
  chart: { w: 6, h: 240 },
  bar: { w: 4, h: 220 },
  heatmap: { w: 6, h: 280 },
  ticker: { w: 3, h: 150 },
  table: { w: 6, h: 260 },
  map: { w: 6, h: 300 },
};
