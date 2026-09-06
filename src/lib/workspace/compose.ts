import {
  type ComponentSpec,
  componentDef,
  packLayout,
  withDefaults,
} from "./components";
import type { DataRef } from "./catalog";

/**
 * A whole app file, from a list of typed components.
 *
 * Generation is total rather than incremental: the manifest is the source of
 * truth and the file is derived from it every time. Splicing a new section into
 * existing text would mean parsing code an agent may have rewritten, and getting
 * that wrong silently corrupts someone's dashboard — regenerating cannot, because
 * it either matches the manifest or it does not compile.
 *
 * The cost of that choice is the rule in `store.ts`: once a model edits an app,
 * the manifest no longer describes it and is dropped. Typed additions after
 * that point go through `annex.ts` — appended beneath the page with their own
 * namespaced runtime — because a typed drop is deterministic and paying a
 * model to retype it was never the product.
 */

export const PREAMBLE = `import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Generated from typed components. Every section below was assembled from a
 * data reference and a shape — no model wrote this file.
 */

/**
 * The build and edit preview panes, where the widget is the only thing worth
 * showing.
 *
 * Stamped by buildDocument alongside \`__dryosBare\`, and read anywhere a
 * section would otherwise draw something that is not the widget: the tile's
 * title and padding, a map's legend, its layer switch, its scrubber, a chart's
 * series key. All of those earn their place on a dashboard, where the tile is
 * as big as somebody made it; in a pane a few hundred pixels tall they are the
 * majority of the box, and what is being judged is what is left.
 *
 * Provenance is the one exception — the MOCK badge stays, because a preview
 * that reads as real is the same lie a launched tile would be telling.
 */
const NAKED = typeof window !== "undefined" && window.__dryosNaked;

/**
 * What every tile is showing, kept for the question somebody asks of it.
 *
 * A double click on a launched tile opens a small chat about the data under
 * the pointer, and the host on the other side of the frame cannot see any of
 * it — so the frame keeps the answer ready. \`useSeries\` registers the rows it
 * holds under the tile it is rendering in (the slot says which, through
 * \`TileIndex\`), \`Section\` registers its title, and whichever readout the
 * pointer is on records the point it is describing on
 * \`window.__dryosHover\`. The click packs all three and posts them out;
 * nothing is fetched twice and nothing crosses the boundary until asked for.
 */
const TILE_DATA = {};
const TILE_META = {};
// The newest interval each series on a tile holds, so the tile's header can
// say what its numbers are as of. Written by useSeries, read by Section.
const TILE_ASOF = {};
const TileIndex = React.createContext(null);
// One counter for every per-instance id the runtime hands out: series
// registrations and the tips that own a hover.
let SERIES_SEQ = 0;

/**
 * One request per selection, polled together and kept in step.
 *
 * \`cursor\` is a tile-local instant (the map's scrubber). When set, every query
 * is rewritten against it before it leaves: \`end\` becomes the cursor, and a
 * *relative* \`start\` — "-30m" — is resolved against the cursor rather than the
 * wall clock, because "the last 30 minutes" means the 30 minutes before the
 * instant on screen. Rewriting only \`end\` would slide the window's far edge
 * while pinning its near one, stretching the window as it scrubbed. The same
 * two rewrites the shim applies for the page-wide cursor, applied here so one
 * tile can hold an instant without dragging the rest of the screen to it.
 */
function useSeries(queries, refreshMs, cursor) {
  const [rows, setRows] = useState(queries.map(() => []));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  /*
    Which queries just brought a newer interval than the load before. \`at[n]\`
    is that newest timestamp for query n, or undefined; \`seq\` climbs on every
    advance so a CSS animation keyed on it restarts rather than continuing.
    Cleared once the animation has had its say, so a still screen carries no
    marker. The first load of a query set is the baseline and never flashes,
    and preview rows never do — sample data has nothing new in it.
  */
  const [fresh, setFresh] = useState({ seq: 0, at: [] });
  // The newest interval loaded, for a shape that draws its own "when".
  const [asOf, setAsOf] = useState(null);
  const newest = useRef([]);
  const freshTimer = useRef(null);
  // The rows as last delivered, for the failure path: a tile that has numbers
  // keeps them through a failed refetch rather than swapping them for the
  // error, and the retry is what puts things right.
  const have = useRef(false);
  const retry = useRef({ timer: null, n: 0 });
  const lastLoad = useRef(0);

  // Which tile this belongs to, and one slot per hook so a component that
  // calls this twice registers both. Null outside a slot — a preview has no
  // host to ask, and a thumbnail is never clicked.
  const tile = React.useContext(TileIndex);
  const slot = useRef(0);
  if (!slot.current) slot.current = ++SERIES_SEQ;
  useEffect(() => {
    if (tile == null) return;
    (TILE_DATA[tile] = TILE_DATA[tile] || {})[slot.current] = { queries, rows };
    return () => {
      if (TILE_DATA[tile]) delete TILE_DATA[tile][slot.current];
      if (TILE_ASOF[tile]) delete TILE_ASOF[tile][slot.current];
    };
  }, [tile, rows]);

  useEffect(() => {
    let live = true;
    function atInstant(q) {
      const at = cursor ? Date.parse(cursor) : NaN;
      if (!at) return q;
      const out = { ...q, end: cursor };
      const m = /^-(\\d+)([mhd])$/.exec(String(q.start == null ? "" : q.start).trim());
      if (m) {
        const n = Number(m[1]);
        const span = m[2] === "m" ? n * 60000 : m[2] === "h" ? n * 3600000 : n * 86400000;
        out.start = new Date(at - span).toISOString();
      }
      return out;
    }
    // A new query set (a wire retarget, a scrub) starts a new baseline.
    newest.current = [];
    async function load() {
      lastLoad.current = Date.now();
      try {
        const out = await Promise.all(queries.map((q) => dryos.query(atInstant(q))));
        if (!live) return;
        setRows(out.map((r) => r.rows));
        setError(null);
        have.current = out.some((r) => r.rows && r.rows.length);
        retry.current.n = 0;
        const seen = out.map((r) =>
          (r.rows || []).reduce((m, x) => {
            const t = Date.parse(x.interval_start_utc);
            return t > m ? t : m;
          }, -Infinity),
        );
        const at = seen.map((t, n) =>
          !out[n].preview && newest.current[n] != null && t > newest.current[n] ? t : undefined,
        );
        newest.current = seen;
        // Sample rows carry made-up times, and an "as of" on them would be a
        // claim the SAMPLE DATA tag exists to deny.
        const asOf = seen.reduce((m, t, n) => (!out[n].preview && t > m ? t : m), -Infinity);
        (TILE_ASOF[tile] = TILE_ASOF[tile] || {})[slot.current] = asOf > -Infinity ? asOf : null;
        setAsOf(asOf > -Infinity ? asOf : null);
        window.dispatchEvent(new CustomEvent("dryos:asof", { detail: { tile } }));
        if (at.some((t) => t != null)) {
          setFresh((f) => ({ seq: f.seq + 1, at }));
          if (freshTimer.current) clearTimeout(freshTimer.current);
          freshTimer.current = setTimeout(() => {
            if (live) setFresh((f) => ({ seq: f.seq, at: [] }));
          }, FRESH_MS);
        }
      } catch (e) {
        if (!live) return;
        /*
          A failed fetch is what a laptop coming back from sleep looks like —
          the request left before the network did — and with the stream up
          there is no poll to try again, so the failure would sit there until
          the next event, an hour away on a slow feed. Retry on a short
          backoff instead. A tile that already has numbers keeps them and
          wears the header's loading mark while it retries; only a tile with
          nothing to show gets the error in the body.
        */
        if (have.current) setLoading(true);
        else setError(e && e.message ? e.message : String(e));
        const n = retry.current.n++;
        clearTimeout(retry.current.timer);
        retry.current.timer = setTimeout(load, Math.min(5000 * 2 ** n, 60000));
        return;
      }
      setLoading(false);
    }
    load();
    // While the host is on the API's event stream, a feed advancing arrives as
    // \`dryos:advanced\` below and the poll does nothing: the stream is
    // watched for its own heartbeat out in the host, so a silence is noticed
    // there and reported as not streaming, and the next tick here is back on
    // cadence. The poll is never removed — without the stream this is exactly
    // what it was before there was one.
    const id = setInterval(() => {
      if (window.dryos && window.dryos.streaming) return;
      load();
    }, refreshMs);
    // A collector landed rows for a dataset this hook reads (null: the stream
    // lost its place, and everything refetches once). Same default as the
    // data route, so a query naming no dataset still matches its own feed.
    function advanced(e) {
      const hit = e.detail && e.detail.datasets;
      if (!hit || queries.some((q) => hit.includes(q.dataset || "ercot-realtime-lmp"))) load();
    }
    window.addEventListener("dryos:advanced", advanced);
    // Coming back — the tab fronted again, the network returned — reloads at
    // once if the last load is more than half a minute old, so a screen left
    // for a while shows the present the moment it is looked at rather than
    // whenever its next event or tick happens to land. Half a minute keeps a
    // tab flickering between windows from firing a request per flicker.
    function back() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoad.current > 30000) load();
    }
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    // The shim fires this when the page's time cursor moves (a shared ?t=
    // link). Without it a tile on a five-minute poll would keep showing the
    // instant you scrubbed away from for another five minutes, and a screen
    // half at one time and half at another is worse than one that is simply
    // behind.
    window.addEventListener("dryos:cursor", load);
    return () => {
      live = false;
      clearInterval(id);
      if (freshTimer.current) clearTimeout(freshTimer.current);
      clearTimeout(retry.current.timer);
      window.removeEventListener("dryos:cursor", load);
      window.removeEventListener("dryos:advanced", advanced);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
    };
    // Stringified because a wired tile (see \`followSnippet\`) swaps its
    // queries when another tile's selection changes — the array is a new
    // object each render, and the string is what says whether it changed.
  }, [cursor, JSON.stringify(queries)]);

  return { rows, error, loading, fresh, asOf };
}

// Three beats of the ring, then gone.
const FRESH_MS = 3600;

/**
 * A recharts \`dot\` that draws only on a series' newest point, and only while
 * that point is new — the flash that says "this just arrived" on a chart that
 * otherwise redraws in silence. \`indexes\` are the queries the series is made
 * of (one for a plain line or a fan-out entity, two for a spread); the point
 * flashes when its timestamp is the newest of any of them.
 *
 * The ring is keyed on \`fresh.seq\`, so a second advance inside the first
 * flash restarts the animation instead of letting it run out. Recharts owns
 * the outer element's key; the inner one is ours.
 *
 * A stacked area's stroke is the surface-colored hairline between segments
 * and its fill is the identity — the same rule the tooltip marker follows.
 */
function freshDot(fresh, ...indexes) {
  const at = indexes.map((n) => fresh.at[n]).filter((t) => t != null);
  if (!at.length) return false;
  return (p) => {
    if (p.cx == null || p.cy == null || !p.payload || !at.includes(p.payload.t)) return null;
    const color = p.stroke === "var(--surface)" ? p.fill : p.stroke;
    return (
      <g>
        <circle key={fresh.seq} cx={p.cx} cy={p.cy} r={3} fill="none" stroke={color} strokeWidth={1.5} className="dr-fresh-ring" />
        <circle cx={p.cx} cy={p.cy} r={2.5} fill={color} />
      </g>
    );
  };
}

/**
 * Mapbox GL, loaded at runtime rather than bundled.
 *
 * The app runs in an opaque origin with no credentials, so the token is handed
 * to it by the host on the \`dryos\` object — a Mapbox public token is designed to
 * be seen by the browser. Loading from a tag instead of bundling keeps a heavy
 * dependency out of every app that does not draw a map.
 */
function useMapbox() {
  const [state, setState] = useState(false);
  useEffect(() => {
    const token = typeof dryos !== "undefined" && dryos.MAPBOX_TOKEN;
    if (!token) return setState("no-token");
    if (window.mapboxgl) {
      window.mapboxgl.accessToken = token;
      return setState(true);
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css";
    document.head.appendChild(css);

    const s = document.createElement("script");
    s.src = "https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js";
    s.onload = () => {
      window.mapboxgl.accessToken = token;
      setState(true);
    };
    s.onerror = () => setState("no-token");
    document.head.appendChild(s);
  }, []);
  return state;
}

/**
 * Which theme this frame is wearing.
 *
 * The host stamps a data-t attribute on the document (see the theme shim in
 * runtime.ts) and can change it at any time, so anything that has to match — a
 * base map, chiefly — watches the attribute rather than reading it once.
 */
function useFrameTheme() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const read = () => {
      const set = document.documentElement.getAttribute("data-t");
      setTheme(set === "light" || set === "dark" ? set : media.matches ? "light" : "dark");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-t"] });
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);

  return theme;
}

/**
 * The canvas is twelve columns wide and a tile carries its own place on it —
 * \`x\` in columns, \`y\` in pixels down from the top.
 *
 * Not a flow of tiles in an order. An order means a tile has no position of its
 * own, only a position relative to its neighbours, so moving one necessarily
 * pushes every one after it. Placed, a tile is where it was put: a move moves
 * one tile, and the hole it leaves is allowed to stay a hole.
 */
const GRID_COLS = 12;
const GRID_GAP = 12;
/** Vertical travel, the same 10px the resize corner already rounded to. */
const GRID_SNAP = 10;

/**
 * The left edge of column \`x\`, and the width of \`w\` columns.
 *
 * Kept as \`calc\` against the canvas's own width rather than resolved to pixels,
 * so a tile stays on its column when the panel beside it is dragged wider.
 */
function gridX(x) {
  const track = "(100% - " + (GRID_COLS - 1) * GRID_GAP + "px) / " + GRID_COLS;
  return "calc(" + track + " * " + x + " + " + x * GRID_GAP + "px)";
}
/**
 * A number on an axis, at the precision an axis can carry.
 *
 * Thousands lose their decimals entirely, everything else keeps one. Recharts
 * prints whatever the data has — six figures for a settlement price — and five
 * of those across the foot of a tile is a row of digits nobody reads.
 */
function axisNum(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString();
  return (Math.round(n * 10) / 10).toString();
}

/*
  The display timezone, threaded through everything that prints a clock.

  The page-level choice lives in the navbar and reaches the frame as
  window.__dryosTz — "source", or an IANA name the host resolved. "source"
  means each component shows its stream's own operating time (ERCOT talks in
  US Central, weather in UTC), which is what SOURCE_TZ carries per component.
  One hook so a change repaints every axis at once; cached formatters because
  Intl.DateTimeFormat construction is the expensive half.
*/
/**
 * A clock face the height of the text beside it. It stands in for the words
 * "as of": a time on its own is a time, a time with a clock is *when this
 * was*, and the glyph costs a character where the words cost six.
 */
function Clock() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden style={{ verticalAlign: "-.12em" }}>
      <circle cx="6" cy="6" r="4.6" />
      <path d="M6 3.4V6l1.9 1.2" />
    </svg>
  );
}

/**
 * Content sized to the box it is given. The ticker's number has to grow with
 * its tile, and a font size has to come from a measurement: each tier is
 * rendered once more as a probe at a fixed 100px, hidden and out of the
 * flow, and the visible copy takes the ratio of the box to it. Measuring the
 * visible copy instead would be a loop, because its size is the thing being
 * decided. Everything inside is written in \`em\`, so one number scales the
 * whole stack.
 *
 * Tiers are the same content with less in it, fullest first. The first tier
 * that fits at its minimum or better is the one drawn — \`min\` is one number
 * for every tier or one per tier, since a comparison line reads at a smaller
 * size than a unit is worth keeping at — and a tile too small for all of
 * them draws the sparsest at whatever it gets, down to \`floor\`. A ticker
 * squeezed to a strip keeps its number and loses its "since last" line, then
 * its unit, rather than keeping everything at a size nothing can be read at.
 */
function FitText({ children, tiers, min, max, floor, style }) {
  const alts = tiers || [children];
  const box = useRef(null);
  const probes = useRef([]);
  const [fit, setFit] = useState({ tier: 0, size: floor || 12 });
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const measure = () => {
      const bw = b.clientWidth, bh = b.clientHeight;
      if (!bw || !bh) return;
      let tier = alts.length - 1;
      let size = floor || 12;
      for (let i = 0; i < alts.length; i++) {
        const p = probes.current[i];
        if (!p || !p.offsetWidth || !p.offsetHeight) continue;
        const s = Math.floor(100 * Math.min(bw / p.offsetWidth, bh / p.offsetHeight));
        const need = Array.isArray(min) ? (min[i] ?? min[min.length - 1] ?? 12) : (min || 12);
        if (s >= need || i === alts.length - 1) {
          tier = i;
          size = Math.max(floor || 12, Math.min(max || 400, s));
          break;
        }
      }
      setFit((f) => (f.tier === tier && f.size === size ? f : { tier, size }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    probes.current.forEach((p) => p && ro.observe(p));
    return () => ro.disconnect();
  }, [alts.length, JSON.stringify(min), max, floor]);
  return (
    <div ref={box} style={{ alignItems: "center", display: "flex", height: "100%", minHeight: 0, minWidth: 0, position: "relative", width: "100%", ...style }}>
      {alts.map((alt, i) => (
        <div key={i} ref={(el) => { probes.current[i] = el; }} aria-hidden style={{ fontSize: 100, left: 0, lineHeight: 1, pointerEvents: "none", position: "absolute", top: 0, visibility: "hidden", whiteSpace: "nowrap" }}>
          {alt}
        </div>
      ))}
      <div style={{ fontSize: fit.size, lineHeight: 1, whiteSpace: "nowrap" }}>{alts[Math.min(fit.tier, alts.length - 1)]}</div>
    </div>
  );
}

function useTz(sourceTz) {
  const read = () => {
    const v = (typeof window !== "undefined" && window.__dryosTz) || "source";
    return v === "source" ? (sourceTz || "UTC") : v;
  };
  const [tz, setTz] = useState(read);
  useEffect(() => {
    const on = () => setTz(read());
    window.addEventListener("dryos:tz", on);
    return () => window.removeEventListener("dryos:tz", on);
  }, []);
  return tz;
}

const __tzFmt = {};
function tzParts(ms, tz) {
  let f = __tzFmt[tz];
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
    } catch {
      // An unknown zone name falls back to UTC rather than throwing mid-render.
      f = new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
    }
    __tzFmt[tz] = f;
  }
  const out = {};
  f.formatToParts(ms).forEach((p) => { out[p.type] = p.value; });
  return out;
}
/** "14:05" in the display timezone. */
function tzTime(ms, tz) {
  const p = tzParts(ms, tz);
  return p.hour + ":" + p.minute;
}
/** "09-01" in the display timezone. */
function tzDate(ms, tz) {
  const p = tzParts(ms, tz);
  return p.month + "-" + p.day;
}
/** A day key for change detection — same day, same string. */
function tzDayKey(ms, tz) {
  const p = tzParts(ms, tz);
  return p.year + "-" + p.month + "-" + p.day;
}
/** The zone's offset from UTC at an instant, in ms — for aligning day ticks. */
function tzOffsetMs(ms, tz) {
  const p = tzParts(ms, tz);
  return (
    Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) -
    Math.floor(ms / 60000) * 60000
  );
}
/** "CST" / "UTC" — the label a reader needs to trust a clock. */
function tzShort(ms, tz) {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short", hour: "2-digit" });
    const p = f.formatToParts(ms).find((x) => x.type === "timeZoneName");
    return p ? p.value : tz;
  } catch {
    return tz;
  }
}

function gridW(w) {
  const track = "(100% - " + (GRID_COLS - 1) * GRID_GAP + "px) / " + GRID_COLS;
  return "calc(" + track + " * " + w + " + " + (w - 1) * GRID_GAP + "px)";
}

/*
  A blank stand-in for the browser's native drag snapshot.

  The editing canvas is the launched screen scaled down, and the browser
  snapshots a dragged element at its *layout* size, not its rendered one — so
  the header bar's ghost drew at unscaled width, longer than the tile it was
  grabbed from. The dashed Ghost on the canvas is the real preview of the
  move; the snapshot adds nothing, so it is a transparent pixel. Created at
  module load rather than in the handler, because setDragImage silently falls
  back to the default when handed an image that has not finished loading.
*/
const DRAG_BLANK = new Image();
DRAG_BLANK.src =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/*
  The rows a tile holds, trimmed for the wire.

  Columns null all the way down go (ERCOT's price components), the bookkeeping
  columns go, and a long series is thinned to \`keep\` rows spread evenly
  across it. Every row for \`want\` — the entity under the click — is kept
  ahead of the thinning, because that is the one the question is about; a
  fan-out over a thousand nodes would otherwise sample it away. \`count\`
  rides along so the reader knows what it is looking at a slice of.
*/
function compactRows(rows, keep, want) {
  if (!rows || !rows.length) return { count: 0, columns: [], rows: [] };
  const drop = { collected_at_utc: 1, source_published_at_utc: 1, node_type: 1 };
  const cols = Object.keys(rows[0]).filter((k) => !drop[k] && rows.some((r) => r[k] != null));
  const slim = (r) => { const o = {}; cols.forEach((k) => { o[k] = r[k]; }); return o; };
  const mine = want ? rows.filter((r) => r.node === want).slice(0, keep) : [];
  const rest = want ? rows.filter((r) => r.node !== want) : rows;
  const room = Math.max(0, keep - mine.length);
  let picked = rest;
  if (rest.length > room) {
    picked = [];
    const step = rest.length / Math.max(1, room);
    for (let i = 0; i < room; i++) picked.push(rest[Math.floor(i * step)]);
  }
  return { count: rows.length, columns: cols, rows: mine.concat(picked).map(slim) };
}

/*
  Everything the host needs to open a chat about a click: the point under the
  pointer (the readout that was showing, or the table row that was pressed),
  the clicked tile's rows, and a digest of every other tile — the question is
  about this number, but "compared to what" is usually the next one.
*/
function askPayload(index, target, x, y) {
  const hover = window.__dryosHover || null;
  const row = !hover && target && target.closest ? target.closest("tr") : null;
  const cells = row ? Array.from(row.cells).map((c) => c.textContent.trim()).filter(Boolean) : null;
  const want = hover && hover.entity ? hover.entity : null;
  const pack = (i, keep) => {
    const meta = TILE_META[i] || {};
    const series = [];
    Object.values(TILE_DATA[i] || {}).forEach((s) => {
      s.queries.forEach((q, n) => {
        series.push(Object.assign({ query: q }, compactRows(s.rows[n], keep, i === index ? want : null)));
      });
    });
    return { index: i, title: meta.title || null, unit: meta.unit || null, series };
  };
  const others = Object.keys(TILE_META)
    .map(Number)
    .filter((i) => i !== index)
    .sort((a, b) => a - b)
    .map((i) => pack(i, 6));
  return {
    __dryos: "ask",
    index,
    x,
    y,
    point: hover
      ? { at: hover.when || null, label: hover.label || null, entity: want, values: hover.values || [] }
      : cells && cells.length
        ? { row: cells }
        : null,
    tile: pack(index, 150),
    screen: others,
  };
}

/**
 * Every section has the same frame, so the page reads as one thing.
 *
 * It carries the three things the host cannot do for it, all for the same
 * reason: the host cannot see into this frame or reach a pointer across its
 * boundary, so anything direct has to happen in here.
 *
 *   · It reports its own rectangle, so a dragged component has a seam to land on.
 *   · It resizes and reorders itself, applying the change immediately and
 *     posting only the result out to be saved. Anything that waited on a round
 *     trip would feel broken at exactly the moment it needs to feel direct.
 *   · It can fill the frame, because a tile sized for a dashboard is not always
 *     sized for the question you are asking of it right now.
 */
// \`minH\` is how short a shape lets itself be dragged: 120 fits a chart's axes,
// a ticker reads at less.
// \`sub\` is the entity beside the title — "HB_NORTH" after "RT · LMP" — in
// the header's quieter voice, so a ticker's tile carries its name once and
// the number gets the rest of the box.
// \`expand\` off hides the ⤢ full-screen control: a ticker is one number, and
// a number that already fills its tile has nothing to gain from the screen.
function Section({ index, title, sub, unit, loading, error, w, h, fill, minH, minW, sourceTz, headerAsOf, expand, children }) {
  const MIN_H = minH || 120;
  const MIN_W = minW || 2;
  const box = useRef(null);
  const [size, setSize] = useState({ w: w || 6, h: h || 240 });
  const narrow = size.w <= 1;
  /*
    What the numbers on this tile are as of: the newest interval any of its
    series holds, in the page's display zone. It arrives by event from
    useSeries rather than as a prop, so every shape carries it without every
    emitter learning to pass it — and a tile whose data is still in flight
    says nothing rather than something stale.
  */
  const tz = useTz(sourceTz);
  const [asOf, setAsOf] = useState(null);
  useEffect(() => {
    const read = () => {
      const at = Object.values(TILE_ASOF[index] || {}).filter((t) => t != null);
      setAsOf(at.length ? Math.max(...at) : null);
    };
    read();
    const on = (e) => { if (e.detail && e.detail.tile === index) read(); };
    window.addEventListener("dryos:asof", on);
    return () => window.removeEventListener("dryos:asof", on);
  }, [index]);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(null);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState(false);
  // Whether the page is being edited, and which tile the panel has open. Both
  // are the host's to know — it owns the panel the settings appear in — so they
  // arrive by message rather than being inferred in here.
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState(null);
  // The tiles shift-clicked into a wired group being built in the strip. A
  // set rather than one slot, because a group is several of them — and the
  // frame draws the ring on each so the selection can be seen where it was made.
  const [marked, setMarked] = useState([]);
  const inGroup = Array.isArray(marked) && marked.includes(index);
  // Stamped by buildDocument for previews: looking, not arranging.
  const bare = typeof window !== "undefined" && window.__dryosBare;
  // ...and the preview panes, where even the title is a line the widget could
  // have had instead.
  const naked = NAKED;
  /* A tile is picked by clicking it, and only while the page is being edited —
     outside edit mode there is no panel for the settings to appear in, and a
     click that opens nothing is worse than a click that does nothing. */
  const selectable =
    !bare && !full && edit && typeof window !== "undefined" && window.parent !== window;
  /* Launched, a double click on the data asks about it. There is no panel to
     configure into, and the question somebody has of a number is the reason
     they are pointing at it — so the point, this tile's rows and a digest of
     the screen go out to the host, which opens a chat where the click was.
     A double click rather than a click because a launched screen is looked
     at, and a single click that opens a window is a window that opens while
     somebody is only pointing. */
  const askable =
    !bare && !edit && typeof window !== "undefined" && window.parent !== window;
  /** Where the pointer went down, so a drag is never mistaken for a click. */
  const from = useRef(null);

  // What this tile is called, for the ask payload of any tile on the screen.
  useEffect(() => {
    TILE_META[index] = { title: sub ? title + " · " + sub : title, unit };
    return () => { delete TILE_META[index]; };
  }, [index, title, sub, unit]);

  useEffect(() => setSize({ w: w || 6, h: h || 240 }), [w, h]);

  /* Every tile listens for itself rather than the App handing it down: the
     annex wrapper renders sections too, and it has no state to thread. */
  useEffect(() => {
    if (window.parent === window) return;
    const onHost = (e) => {
      const m = e.data;
      if (!m || typeof m !== "object" || m.__dryos !== "mode") return;
      setEdit(Boolean(m.edit));
      setPicked(typeof m.selected === "number" ? m.selected : null);
      setMarked(Array.isArray(m.marked) ? m.marked : []);
    };
    window.addEventListener("message", onHost);
    return () => window.removeEventListener("message", onHost);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  useEffect(() => {
    const el = box.current;
    if (!el || window.parent === window) return;
    // Viewport-relative on purpose: the host overlay sits on top of this frame,
    // so its origin and this frame's viewport origin are the same point.
    const report = () => {
      const r = el.getBoundingClientRect();
      parent.postMessage(
        { __dryos: "section", index, title, top: r.top, height: r.height },
        "*",
      );
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("scroll", report, true);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", report, true);
      window.removeEventListener("resize", report);
    };
  }, [index, title]);

  function grab(e) {
    e.preventDefault();
    const host = box.current;
    // On a canvas the tile sits inside its own positioned slot, so the column
    // width comes from the canvas rather than from the box one level up. In the
    // annex there is no slot and the parent is the grid itself.
    const parentEl = host.parentElement;
    const slot = parentEl && parentEl.dataset.slot != null ? parentEl : null;
    const grid = slot ? slot.parentElement : parentEl;
    // One column, in pixels, from the grid the tile actually sits in.
    const col = (grid.clientWidth - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;
    // The canvas's own floor, same as tileLanding reads for a placement — a
    // resize is a drag like any other and the ground rule is the same: nothing
    // lands (or grows) past ground that isn't there yet. Read once, at grab
    // time, so a tile growing into the strip below it does not chase its own
    // shadow as the canvas would only grow back on drop.
    const floor = grid.getBoundingClientRect().height;
    const me = slot ? { x: Number(slot.dataset.x), y: Number(slot.dataset.y) } : null;
    const others = slot
      ? tileRects(grid).filter((t) => t.index !== Number(slot.dataset.slot))
      : [];
    const start = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    setDragging(true);

    /*
      Nothing gets out of the way, so growing stops where the neighbour starts —
      the way a window stops at the edge of a screen.

      Height settles first, against the width the tile already had, and width is
      then measured against the height that settled. That order is not a
      preference: it is the one that cannot overlap. Anything the final
      rectangle could touch has to overlap it on both axes, and the width pass
      only exempts tiles that clear the settled height — so a tile the height
      pass let by is a tile the width pass stops at. Taking width first instead
      let a tile *underneath* count as a neighbour to the side, and a tall drag
      collapsed the tile to its minimum width.
    */
    const measure = (ev) => {
      let w = Math.max(MIN_W, Math.min(GRID_COLS, start.w + Math.round((ev.clientX - start.x) / (col + GRID_GAP))));
      let h = Math.max(MIN_H, Math.min(900, Math.round((start.h + (ev.clientY - start.y)) / GRID_SNAP) * GRID_SNAP));
      if (me) {
        h = Math.min(h, floor - me.y);
        others.forEach((o) => {
          if (o.y >= me.y && o.x < me.x + start.w && me.x < o.x + o.w) h = Math.min(h, o.y - GRID_GAP - me.y);
        });
        h = Math.max(MIN_H, h);
        w = Math.min(w, GRID_COLS - me.x);
        others.forEach((o) => {
          if (o.x >= me.x && o.y < me.y + h && me.y < o.y + o.h) w = Math.min(w, o.x - me.x);
        });
        w = Math.max(MIN_W, w);
      }
      return { w: w, h: h };
    };

    const move = (ev) => {
      const next = measure(ev);
      setSize(next);
      // The slot is React's, but it has to follow the corner in real time.
      // These are the same expressions React writes, so when the finished size
      // reaches state there is nothing to undo and nothing to flash.
      if (slot) {
        slot.style.width = gridW(next.w);
        slot.style.height = next.h + "px";
      }
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      const final = measure(ev);
      setSize(final);
      // The canvas keeps everyone's rectangle, so it has to hear about this one
      // — the next drag measures its gaps against it.
      window.dispatchEvent(
        new CustomEvent("dryos:tilesized", { detail: { index, w: final.w, h: final.h } }),
      );
      if (window.parent !== window) {
        parent.postMessage({ __dryos: "resize", index, w: final.w, h: final.h }, "*");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const frame = full
    ? {
        background: "var(--bg)",
        border: "1px solid var(--accent)",
        borderRadius: 8,
        bottom: 8,
        display: "flex",
        flexDirection: "column",
        left: 8,
        overflow: "hidden",
        padding: 12,
        position: "fixed",
        right: 8,
        top: 8,
        zIndex: 50,
      }
    : {
        background: "var(--surface)",
        // A preview is one component inside a box that already has a border;
        // drawing the tile's own inside it reads as a frame around a frame.
        border: bare || naked
          ? "none"
          : "1px solid " +
            (dragging || picked === index || inGroup
              ? "var(--accent)"
              : over
                ? "var(--info)"
                : selectable && hover
                  ? "var(--line-strong)"
                  : "var(--line)"),
        borderRadius: 8,
        // The picked tile is the one the panel is talking about, so it is
        // stated twice — a second ring, because one hairline of accent is the
        // same weight as the hover it has to be told apart from.
        // A tile marked for a group wears the same ring, only solid: it is
        // one of several, and a dim halo reads as "the one".
        boxShadow: inGroup
          ? "0 0 0 2px var(--accent)"
          : picked === index
            ? "0 0 0 2px var(--accent-dim)"
            : "none",
        cursor: selectable ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gridColumn: "span " + size.w,
        height: size.h,
        overflow: "hidden",
        // Naked, the box is the widget: no gutter, because the pane's own
        // border is already the edge and twelve pixels inside it is twelve
        // pixels of chart.
        padding: naked ? 0 : 12,
        position: "relative",
      };

  return (
    <section
      ref={box}
      data-tile={index}
      style={frame}
      onMouseEnter={() => setHover(true)}
      // Leaving the tile forgets the readout: a hover recorded here must not
      // answer for a click on the tile next door.
      onMouseLeave={() => { setHover(false); window.__dryosHover = null; }}
      onPointerDown={(e) => { from.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        if (!selectable) return;
        /* Three things a click here is not: a press of the tile's own chrome,
           a control inside the component, or the tail of a drag — a map panned
           by six pixels ends in a click event like any other. */
        if (e.target.closest && e.target.closest("button, a, input, select, textarea, [data-nopick]")) return;
        const d = from.current;
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) return;
        // Shift is "this one too": the host adds the tile to the wired group
        // being built instead of opening its settings.
        window.dispatchEvent(
          new CustomEvent("dryos:tileconfigure", { detail: { index, shift: e.shiftKey } }),
        );
      }}
      onDoubleClick={(e) => {
        if (!askable) return;
        if (e.target.closest && e.target.closest("button, a, input, select, textarea, [data-nopick]")) return;
        const d = from.current;
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) return;
        parent.postMessage(askPayload(index, e.target, e.clientX, e.clientY), "*");
      }}
    >
      {/*
        Naked, there is no header at all — not the handle, not the title. The
        pane above already names what is being previewed, so the tile repeating
        it costs a line and says nothing new.

        Otherwise the whole header is the handle, the way a window is dragged by
        its title bar. Dragging by the body would fight every chart underneath it
        for the same gesture, and the ⠿ glyph alone was a target a few pixels
        wide that had to be aimed at. The glyph stays as the cue that the bar
        is grabbable; the buttons in the bar cancel the drag so they stay pure
        clicks.
      */}
      {!naked && (
      <header
        draggable={!bare && !full}
        onDragStart={(e) => {
          if (bare || full) return;
          if (e.target.closest && e.target.closest("button, a, input, select, textarea")) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData("text/dryos-tile", String(index));
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(DRAG_BLANK, 0, 0);
          // The canvas decides where it lands; this only says what is in
          // flight — and where inside it the cursor took hold, so the tile
          // travels under the hand instead of snapping its corner there.
          const r = box.current.getBoundingClientRect();
          window.dispatchEvent(
            new CustomEvent("dryos:tilegrab", {
              detail: {
                index,
                w: size.w,
                h: size.h,
                offX: e.clientX - r.left,
                offY: e.clientY - r.top,
              },
            }),
          );
        }}
        onDragEnd={() => window.dispatchEvent(new CustomEvent("dryos:tiledrop"))}
        title={!bare && !full ? "Drag to move" : undefined}
        style={{
          alignItems: "center",
          cursor: !bare && !full ? "grab" : undefined,
          display: "flex",
          gap: 8,
          marginBottom: 8,
          userSelect: "none",
        }}
      >
        {!bare && !narrow && (
        <span
          aria-hidden="true"
          style={{
            color: "var(--line-strong)",
            fontSize: 11,
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
        >
          ⠿
        </span>
        )}
        {/* Title, stream and unit flow as one group. Only the one-column
            form wraps, dropping the stream under the entity; everywhere
            else the row stays one line and the stream ellipsizes first, the
            entity only once it is alone and still too long. A header that
            wrapped whenever the row ran a few pixels short cost the tile a
            line of height, and on a ticker the number is sized to the box
            left over — two tickers of the same size drew two sizes of
            number, the one with the longer name smaller. */}
        <div style={{ alignItems: "baseline", columnGap: 8, display: "flex", flexWrap: narrow ? "wrap" : "nowrap", minWidth: 0, rowGap: 2 }}>
          <h2 style={{ color: "var(--ink)", flexShrink: narrow ? 1 : 0, fontSize: narrow ? 12 : 13, fontWeight: 600, margin: 0, maxWidth: "100%", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          {sub && <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase", whiteSpace: "nowrap" }}>{sub}</span>}
          {unit && <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit}</span>}
          {/* In the info blue rather than the accent: the accent already
              means "new" on this screen, and amber means "late" in the
              feeds menu. This is neither — it is when. */}
          {/* Off for a shape that draws the time itself (the ticker). */}
          {asOf != null && headerAsOf !== false && (
            <span
              title={"Newest interval on this tile: " + tzDate(asOf, tz) + " " + tzTime(asOf, tz) + " " + tzShort(asOf, tz)}
              style={{ color: "var(--info)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".04em", whiteSpace: "nowrap" }}
            >
              <Clock /> {tzTime(asOf, tz)}
            </span>
          )}
        </div>
        {loading && <span style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10 }}>loading…</span>}
        {/*
          On a one-column tile the two controls are wider than the name
          they sit beside, so there they float over the header's corner
          and appear on hover; at rest the entity and the stream get the
          whole row, which is the concise form a narrow ticker exists for.
        */}
        {!bare && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: "auto",
            ...(narrow
              ? {
                  background: "var(--surface)",
                  opacity: hover || full ? 1 : 0,
                  pointerEvents: hover || full ? "auto" : "none",
                  position: "absolute",
                  right: 12,
                  top: 12,
                  transition: "opacity .12s",
                }
              : {}),
          }}
        >
        {expand !== false && (
        <button
          onClick={() => setFull((v) => !v)}
          title={full ? "Back to the dashboard (Esc)" : "Fill the screen"}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 4,
            color: full ? "var(--accent)" : "var(--faint)",
            cursor: "pointer",
            fontSize: 10,
            lineHeight: 1,
            padding: "3px 5px",
          }}
        >
          {full ? "✕" : "⤢"}
        </button>
        )}
        {/*
          No ⚙. The tile is its own button while the page is being edited —
          clicking anywhere on it opens its settings — so a control that meant
          "this one" was a second way to say what pointing at it already says.
        */}
        {!full && window.parent !== window && (
          <button
            onClick={() =>
              // One click, no "are you sure": the revision this writes is the
              // undo, which is a better safety net than a second click nobody
              // reads. The grid hides the tile the same instant; the save
              // catches up behind the gesture.
              window.dispatchEvent(
                new CustomEvent("dryos:tileremove", { detail: { index } }),
              )
            }
            title="Remove from the dashboard"
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 4,
              color: "var(--faint)",
              cursor: "pointer",
              fontSize: 10,
              lineHeight: 1,
              padding: "3px 5px",
            }}
          >
            ✕
          </button>
        )}
        </div>
        )}
      </header>
      )}

      {/*
        The fill flag is for shapes that draw into their whole box — a chart or a
        map has no natural height and has to be told one. Absolute positioning
        rather than a percentage: a percentage height resolves against a parent
        that has one, and a flex child in an auto-height column does not always.
      */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: fill ? "hidden" : "auto",
          position: "relative",
          // A double click selects a word, and the word under it was an axis
          // label — the chart lit up with a highlight every time somebody
          // asked about a point. A tile is read, not copied from.
          userSelect: "none",
        }}
      >
        {error ? (
          <p style={{ background: "var(--surface-2)", border: "1px solid var(--fail)", borderRadius: 6, color: "var(--fail)", fontFamily: "var(--mono)", fontSize: 12, margin: 0, padding: "8px 10px" }}>
            {error}
          </p>
        ) : (
          children
        )}
      </div>

      {/* Bottom-right corner, the way every resizable panel has worked forever. */}
      {!bare && !full && (
        <span
          data-nopick
          onPointerDown={grab}
          title="Drag to resize"
          style={{
            bottom: 2,
            color: dragging ? "var(--accent)" : "var(--line-strong)",
            cursor: "nwse-resize",
            fontSize: 11,
            lineHeight: 1,
            padding: 4,
            position: "absolute",
            right: 2,
            touchAction: "none",
            userSelect: "none",
          }}
        >
          ◢
        </span>
      )}

      {dragging && (
        <span
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--accent)",
            borderRadius: 4,
            bottom: 18,
            color: "var(--accent)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            padding: "1px 5px",
            position: "absolute",
            right: 14,
          }}
        >
          {size.w}/12 · {size.h}px
        </span>
      )}
    </section>
  );
}

/** Every tile's rectangle, read off the canvas the App just rendered. */
function tileRects(grid) {
  return [...grid.querySelectorAll(":scope > [data-slot]")].map((el) => ({
    index: Number(el.dataset.slot),
    x: Number(el.dataset.x),
    y: Number(el.dataset.y),
    w: Number(el.dataset.w),
    h: Number(el.dataset.h),
  }));
}

/** Do two tiles share any ground? Half-open on both axes. */
function tileOverlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Where a dragged tile would land.
 *
 * Three answers, in order: the free rectangle under the cursor; a swap with the
 * tile it is squarely on top of, when both still land clear; or nothing, in
 * which case the caller holds the preview it already had rather than showing
 * one it would not honour. No answer ever moves a third tile — that is the
 * whole rule, and the reason a hole left behind stays a hole.
 */
function tileLanding(grid, rects, self, drag, px, py) {
  const r = grid.getBoundingClientRect();
  const stride = (r.width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS + GRID_GAP;
  const w = drag.w;
  const h = drag.h;
  // Clamped on every side, the bottom included: the canvas is the whole of the
  // droppable ground, and a tile allowed past its edge is a tile dragged out
  // of view. The strip past the last tile is inside the rect, so a page still
  // grows downward — by one visible step at a time, never into the void.
  const floor = Math.max(0, Math.floor((r.height - h) / GRID_SNAP) * GRID_SNAP);
  const want = {
    x: Math.max(0, Math.min(GRID_COLS - w, Math.round((px - r.left - drag.offX) / stride))),
    y: Math.max(0, Math.min(floor, Math.round((py - r.top - drag.offY) / GRID_SNAP) * GRID_SNAP)),
    w: w,
    h: h,
  };

  const others = rects.filter((t) => t.index !== self);
  if (!others.some((o) => tileOverlaps(want, o))) return { x: want.x, y: want.y, swap: null };
  // Nothing was picked up — an incoming tile has no place to trade.
  if (self === null || self === undefined) return null;

  // Squarely on top of one tile: the two trade places. Most-overlapped rather
  // than whatever the pointer happens to be inside, because the rectangle in
  // flight is what has to fit, not the cursor.
  const mine = rects.find((t) => t.index === self);
  let hit = null;
  let most = 0;
  others.forEach((o) => {
    const area =
      Math.max(0, Math.min(want.x + w, o.x + o.w) - Math.max(want.x, o.x)) *
      Math.max(0, Math.min(want.y + h, o.y + o.h) - Math.max(want.y, o.y));
    if (area > most) {
      most = area;
      hit = o;
    }
  });
  if (!hit || !mine) return null;

  const a = { x: Math.min(hit.x, GRID_COLS - w), y: hit.y, w: w, h: h };
  const b = { x: Math.min(mine.x, GRID_COLS - hit.w), y: mine.y, w: hit.w, h: hit.h };
  const rest = others.filter((o) => o.index !== hit.index);
  // A swap that would sit on a third tile is not a swap.
  if (tileOverlaps(a, b)) return null;
  if (rest.some((o) => tileOverlaps(a, o) || tileOverlaps(b, o))) return null;
  return { x: a.x, y: a.y, swap: { index: hit.index, x: b.x, y: b.y, w: b.w, h: b.h } };
}

/**
 * Where the tile will be, drawn at the size it will be, in the place it will be.
 *
 * Not a marker pointing at a position — it is the position, already taken. It
 * used to be an element in the flow, which meant the preview shoved every tile
 * aside to show itself, and shoving them changed the answer to where the
 * pointer was: the gap moved, so the gap moved. Placed absolutely it disturbs
 * nothing, so what it shows is stable and is exactly what a drop produces.
 *
 * A second, quieter one appears on a swap — that tile is going somewhere too,
 * and it is the only case where anything but the tile in hand moves.
 */
function Ghost({ x, y, w, h, placing, trading }) {
  return (
    <div
      style={{
        background: trading ? "transparent" : "var(--accent-dim, rgba(232,255,61,.06))",
        border: "1px dashed " + (trading ? "var(--line-strong)" : "var(--accent)"),
        borderRadius: 8,
        height: h || 240,
        left: gridX(x || 0),
        pointerEvents: "none",
        position: "absolute",
        top: y || 0,
        width: gridW(w || 6),
        // Dropped, composing: the gap breathes so the wait reads as work.
        animation: placing ? "dr-ghost 1.1s ease-in-out infinite" : undefined,
      }}
    />
  );
}

/*
  A two-line time tick: the hour on the first line, the date beneath it where
  the day changes. One axis wearing two levels of context, rather than a
  second XAxis — a time ruler is one ruler, and a second axis would spend a
  band of plot height restating the first. \`labels\` is the chart's own
  tick-to-label map (built beside the ticks, because a formatter sees one
  value at a time and cannot know its neighbour's day); anything not in it
  falls back to the plain hour so a degenerate chart still labels itself.
*/
function TimeTick({ x, y, payload, labels, tz }) {
  const v = payload && payload.value;
  if (typeof v !== "number" || !isFinite(v)) return null;
  const at = (labels && labels.get(v)) || { top: tzTime(v, tz || "UTC"), sub: null };
  return (
    <g transform={"translate(" + x + "," + y + ")"}>
      <text dy={10} textAnchor="middle" fill="var(--faint)" fontSize={11}>{at.top}</text>
      {at.sub ? (
        <text dy={23} textAnchor="middle" fill="var(--faint)" fontSize={9.5}>{at.sub}</text>
      ) : null}
    </g>
  );
}

// \`units\` maps a dataKey to its own unit, for a dual-axis chart whose sides
// measure different things; absent, every row wears the chart's one unit.
// \`tz\` is the display timezone; absent, UTC — and the short zone name rides
// beside the clock, because a time with no zone on it is a number, not a time.
function ChartTip({ active, payload, label, unit, units, tz }) {
  // The point being read, for the double click that asks about it (see
  // askPayload). A plain assignment during render, on purpose: recharts
  // renders this on every pointer move, and an effect would be a render
  // behind. The clear is owned: a tip only forgets a readout it wrote. Every
  // chart re-renders its tip inactive when its data changes — a poll, or a
  // wire retargeting it off a map click — and an unowned clear there wiped
  // the node under the pointer on the map between the first click and the
  // second, so the ask arrived with no point.
  const me = useRef(0);
  if (!me.current) me.current = ++SERIES_SEQ;
  if (!active || !payload || !payload.length) {
    if (window.__dryosHover && window.__dryosHover.owner === me.current) window.__dryosHover = null;
    return null;
  }
  const zone = tz || "UTC";
  window.__dryosHover = {
    owner: me.current,
    when: typeof label === "number" ? new Date(label).toISOString() : String(label),
    label: tzTime(label, zone) + " " + tzShort(label, zone),
    values: payload.map((p) => ({ name: p.name, value: p.value, unit: (units && units[p.dataKey]) || unit || "" })),
  };
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, padding: "6px 9px" }}>
      <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
        {tzTime(label, zone)} {tzShort(label, zone)}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: "var(--ink)" }}>
          {/*
            The line's own color, which is its stroke.

            Reading the fill first drew every one of these white: a recharts
            Line carries fill "#fff" by default and never paints it, so the
            marker that is supposed to say which line this is said nothing at
            all. The one case where the stroke is not the identity is a stacked
            area — there the stroke is the surface-colored hairline between
            segments and the fill is the color — so that is the exception, not
            the rule.
          */}
          <span style={{ color: p.stroke && p.stroke !== "var(--surface)" ? p.stroke : p.fill }}>■ </span>
          {p.name}: <strong>{p.value == null ? "—" : Number(p.value).toFixed(2)}</strong> {(units && units[p.dataKey]) || unit}
        </div>
      ))}
    </div>
  );
}`;

/**
 * Everything recharts exports that a generator uses.
 *
 * A custom component's source is opaque to us — it may have been rewritten by
 * the agent and may reach for a chart type no generator emits — so its section
 * gets the full set rather than a guess parsed out of the code.
 */
const RECHARTS_ALL = [
  "Area",
  "AreaChart",
  "Bar",
  "BarChart",
  "CartesianGrid",
  "Cell",
  "Legend",
  "Line",
  "LineChart",
  "Pie",
  "PieChart",
  "ReferenceLine",
  "ResponsiveContainer",
  "Tooltip",
  "XAxis",
  "YAxis",
];

/**
 * Give a saved component the function name and the index its slot expects.
 *
 * A custom component was authored standing alone, so its function is named for
 * its own kind and its `Section` was handed whichever index it had at the time —
 * always 0, since the editor composes it as a one-tile app. Two of the same kind
 * in one dashboard would collide on the name; every one of them would collide on
 * the index, and the index is what a resize, a remove or a drag reports itself
 * as. Both are rewritten to the slot the component is actually landing in.
 */
function renameSection(
  code: string,
  index: number,
): string {
  return (
    code
      .replace(
        /^function\s+([A-Za-z0-9_]+?)\d*\s*\(/m,
        (_m, base) => `function ${base}${index}(`,
      )
      // Only the outer frame's own tag — a refinement may reorder its props, but
      // it is still the first `<Section` in the file.
      .replace(/<Section\b[^>]*>/, (tag) =>
        tag.replace(/\bindex=\{\d+\}/, `index={${index}}`),
      )
  );
}

export function composeApp(input: ComponentSpec[]): string {
  // Every tile gets an explicit place before anything is emitted. A page from
  // before positions existed is frozen into the arrangement the old flow grid
  // gave it — same wrap, same rows — so nothing on anyone's screen moves the
  // first time this runs.
  const manifest = packLayout(input);
  const placed = manifest.map(
    (spec) =>
      spec.layout as Required<
        NonNullable<ComponentSpec["layout"]>
      >,
  );

  const sections = manifest
    .map((spec, i) => {
      // A saved custom component carries its own finished source — possibly
      // refined by the agent — so it is used verbatim rather than regenerated.
      if (spec.custom) {
        return {
          code: renameSection(spec.custom.code, i),
          imports: RECHARTS_ALL,
        };
      }
      const def = componentDef(spec.kind);
      return def?.emit(
        spec.refs,
        i,
        withDefaults(def, spec.options),
      );
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const imports = [
    ...new Set(sections.flatMap((s) => s.imports)),
  ].sort();
  const recharts = imports.length
    ? `import { ${imports.join(", ")} } from "recharts";\n`
    : "";

  const names = manifest.map((spec, i) => {
    const base = spec.custom
      ? (/^function\s+([A-Za-z0-9_]+?)\d*\s*\(/m.exec(
          spec.custom.code,
        )?.[1] ?? spec.kind)
      : spec.kind;
    return `${base[0].toUpperCase()}${base.slice(1)}${i}`;
  });

  if (manifest.length === 0) {
    /*
      An empty screen shows the gesture instead of describing it.

      It used to carry a heading and a sentence — including "no model involved",
      which is an argument about how the product works, aimed at somebody who
      has not used it yet and is not asking. What is actually needed here is one
      thing: that a component arrives by being dragged onto this surface. So the
      canvas drifts, a component slides into an empty slot on a loop, and the
      only words are the six that name the two steps.
    */
    return `${PREAMBLE}

export default function App() {
  // Stamped by buildDocument for thumbnails and previews. A thumbnail is
  // looked at, not arranged, so the drop-target demo out there was an
  // animation performing to nobody — a preview of an empty page just says so.
  const bare = typeof window !== "undefined" && window.__dryosBare;

  return (
    <div
      style={{
        alignItems: "center",
        borderRadius: 8,
        display: "flex",
        justifyContent: "center",
        minHeight: "calc(100vh - 32px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* The ground: a wash of the accent, well under the threshold of being
          noticed, so the surface reads as live rather than blank. It drifts
          only in the editor — a preview is a postcard, and a postcard that
          moves is a bug report. */}
      <div
        aria-hidden
        className={bare ? undefined : "dr-drift"}
        style={{
          background:
            "radial-gradient(60% 55% at 50% 42%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)," +
            "radial-gradient(45% 45% at 78% 78%, color-mix(in oklab, var(--info) 10%, transparent), transparent 70%)",
          inset: "-10%",
          position: "absolute",
        }}
      />

      {bare ? (
        /* Sized for the thumbnail it lives in: the frame renders at 250% and
           is scaled to 0.4, so anything under ~32px out there is lint. */
        <p style={{ color: "var(--muted)", fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", margin: 0, position: "relative" }}>
          Nothing here yet
        </p>
      ) : (
        <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
          {/* The slot, and the component landing in it on a loop — the
              gesture performed, faster than the sentence below reads. */}
          <div
            className="dr-slot"
            style={{
              alignItems: "center",
              border: "1px dashed var(--line-strong)",
              borderRadius: 10,
              display: "flex",
              height: 104,
              justifyContent: "center",
              width: 168,
            }}
          >
            <div
              className="dr-drop"
              style={{
                alignItems: "center",
                background: "var(--surface)",
                border: "1px solid var(--accent)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,.28)",
                display: "flex",
                height: 76,
                justifyContent: "center",
                width: 140,
              }}
            >
              <svg width="104" height="40" viewBox="0 0 104 40" fill="none" aria-hidden>
                <polyline
                  points="4,30 20,22 34,26 50,10 66,18 82,6 100,14"
                  stroke="var(--s1)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="4,36 20,33 34,34 50,27 66,31 82,24 100,29"
                  stroke="var(--s2)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: 0 }}>
            Pick data, then drag a component here
          </p>
        </div>
      )}
    </div>
  );
}
`;
  }

  /*
    Both ends of a wire wear the pair's color, as an outline on the slot —
    outside edit mode only, where the border is information rather than
    chrome competing with the editing furniture. The color is stored on the
    receiver (`wireColor`, a palette slot so it steps with the theme; absent
    means accent) and computed here because only the whole manifest knows
    which tile is somebody's source. Validated to an integer before it is
    written into TSX — anything else falls back to the accent.
  */
  const wireBorders: Record<number, string> = {};
  manifest.forEach((spec, i) => {
    const f = Number(spec.options?.follow);
    if (!Number.isInteger(f) || f < 0 || !manifest[f])
      return;
    const slot = Number(spec.options?.wireColor);
    const color =
      Number.isInteger(slot) && slot >= 1 && slot <= 8
        ? `var(--s${slot})`
        : "var(--accent)";
    wireBorders[i] = color;
    wireBorders[f] = color;
  });

  return [
    PREAMBLE.replace(
      'import React, { useEffect, useMemo, useRef, useState } from "react";\n',
      `import React, { useEffect, useMemo, useRef, useState } from "react";\n${recharts}`,
    ),
    "",
    ...sections.map((s) => s.code),
    "",
    `export default function App() {`,
    `  const grid = useRef(null);`,
    `  // Which tiles are wired to which, worn as an outline outside edit mode.`,
    `  const WIRE_BORDERS = ${JSON.stringify(wireBorders)};`,
    `  // The page's own copy of the mode — Sections hold theirs for their`,
    `  // chrome, and the wire outlines are drawn by the slots out here.`,
    `  const [edit, setEdit] = useState(false);`,
    `  // Stamped by buildDocument for thumbnails and previews: looking, not`,
    `  // arranging, so no room is kept below the last tile to drop into.`,
    `  const bare = typeof window !== "undefined" && window.__dryosBare;`,
    ``,
    `  // Where every tile sits. Held here so a move lands instantly; the host`,
    `  // saves it behind the gesture and nothing waits on that round trip.`,
    `  // Nothing in here is derived from anything else in here — which is what`,
    `  // makes moving one tile move exactly one tile.`,
    `  const [pos, setPos] = useState([`,
    ...placed.map(
      (l) =>
        `    { x: ${l.x}, y: ${l.y}, w: ${l.w}, h: ${l.h} },`,
    ),
    `  ]);`,
    `  // The tile in flight — a ref, because it changes on every dragover event`,
    `  // and none of those should cost a render.`,
    `  const drag = useRef(null);`,
    `  const [moving, setMoving] = useState(null);`,
    `  // The rectangle the drop would take, and its partner if it is a swap.`,
    `  const [ghost, setGhost] = useState(null);`,
    `  // Dropped and being composed: the gap holds its place, pulsing, until`,
    `  // the revision that fills it replaces this frame — or the host says the`,
    `  // placement failed and releases it.`,
    `  const [placing, setPlacing] = useState(false);`,
    `  // Removed tiles vanish here first; the saved revision catches up behind`,
    `  // the gesture, and a failed save restores them via "restore".`,
    `  const [hidden, setHidden] = useState(() => new Set());`,
    ``,
    `  // Memoised so the elements keep their identity: a ghost tracking the`,
    `  // cursor must not re-render a dozen charts to move itself one column.`,
    `  const tiles = useMemo(() => [`,
    ...names.map(
      (n, i) =>
        `    <${n} key={${i}} w={pos[${i}].w} h={pos[${i}].h} />,`,
    ),
    `  ], [pos]);`,
    ``,
    `  // What a drop would do, and the preview of it. Refs only, so it is safe`,
    `  // to call from the message handler that was mounted once.`,
    `  function propose(px, py) {`,
    `    const g = drag.current;`,
    `    if (!g || !grid.current) return null;`,
    `    const at = tileLanding(grid.current, tileRects(grid.current), g.index, g, px, py);`,
    `    // Nowhere valid under the cursor: hold the preview already showing`,
    `    // rather than flicker one that would not be honoured.`,
    `    if (!at) return null;`,
    `    setGhost((prev) =>`,
    `      prev &&`,
    `      prev.x === at.x &&`,
    `      prev.y === at.y &&`,
    `      prev.w === g.w &&`,
    `      prev.h === g.h &&`,
    `      Boolean(prev.swap) === Boolean(at.swap) &&`,
    `      (!prev.swap || prev.swap.index === at.swap.index)`,
    `        ? prev`,
    `        : { x: at.x, y: at.y, w: g.w, h: g.h, swap: at.swap },`,
    `    );`,
    `    return at;`,
    `  }`,
    ``,
    `  // An in-frame drag announces itself; one from the host arrives by message,`,
    `  // because a drag started outside this document cannot fire events inside it.`,
    `  useEffect(() => {`,
    `    const onGrab = (e) => { drag.current = e.detail; setMoving(e.detail.index); };`,
    `    const onDrop = () => { drag.current = null; setMoving(null); setGhost(null); };`,
    `    const onSized = (e) => setPos((prev) =>`,
    `      prev.map((p, i) => (i === e.detail.index ? { x: p.x, y: p.y, w: e.detail.w, h: e.detail.h } : p)),`,
    `    );`,
    `    const onRemove = (e) => {`,
    `      const i = e.detail.index;`,
    `      setHidden((prev) => { const next = new Set(prev); next.add(i); return next; });`,
    `      if (window.parent !== window) parent.postMessage({ __dryos: "remove", index: i }, "*");`,
    `    };`,
    `    const onConfigure = (e) => {`,
    `      if (window.parent !== window) parent.postMessage({ __dryos: "configure", index: e.detail.index, shift: Boolean(e.detail.shift) }, "*");`,
    `    };`,
    `    // Any press closes the chat a double click opened; the double click`,
    `    // that follows reopens it if it lands on data. The host cannot see either.`,
    `    const onPress = () => {`,
    `      if (window.parent !== window) parent.postMessage({ __dryos: "press" }, "*");`,
    `    };`,
    `    const onHost = (e) => {`,
    `      const m = e.data;`,
    `      if (!m || typeof m !== "object") return;`,
    `      if (m.__dryos === "restore") setHidden(new Set());`,
    `      if (m.__dryos === "mode") setEdit(Boolean(m.edit));`,
    `      if (m.__dryos === "dragover" && grid.current) {`,
    `        setPlacing(false);`,
    `        const r = grid.current.getBoundingClientRect();`,
    `        const stride = (r.width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS + GRID_GAP;`,
    `        // Nothing was picked up out here, so the incoming tile hangs`,
    `        // centred on the cursor rather than by a corner.`,
    `        drag.current = { index: null, w: m.w, h: m.h, offX: (m.w * stride - GRID_GAP) / 2, offY: m.h / 2 };`,
    `        const at = propose(m.x, m.y);`,
    `        // The ghost's own rectangle rides along in frame pixels, so the`,
    `        // host can float the live preview of the incoming tile exactly`,
    `        // where the drop will put it — a dashed box says where, but the`,
    `        // component itself already exists in the panel and showing it is`,
    `        // strictly more answer.`,
    `        if (at) {`,
    `          const track = (r.width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;`,
    `          parent.postMessage({ __dryos: "spot", x: at.x, y: at.y, rect: {`,
    `            left: r.left + at.x * (track + GRID_GAP),`,
    `            top: r.top + at.y,`,
    `            width: track * m.w + (m.w - 1) * GRID_GAP,`,
    `            height: m.h,`,
    `          } }, "*");`,
    `        }`,
    `      } else if (m.__dryos === "placed") {`,
    `        setPlacing(true);`,
    `      } else if (m.__dryos === "dragend") {`,
    `        setPlacing(false);`,
    `        onDrop();`,
    `      }`,
    `    };`,
    `    window.addEventListener("dryos:tilegrab", onGrab);`,
    `    window.addEventListener("dryos:tiledrop", onDrop);`,
    `    window.addEventListener("dryos:tilesized", onSized);`,
    `    window.addEventListener("dryos:tileremove", onRemove);`,
    `    window.addEventListener("dryos:tileconfigure", onConfigure);`,
    `    window.addEventListener("pointerdown", onPress);`,
    `    window.addEventListener("message", onHost);`,
    `    return () => {`,
    `      window.removeEventListener("dryos:tilegrab", onGrab);`,
    `      window.removeEventListener("dryos:tiledrop", onDrop);`,
    `      window.removeEventListener("dryos:tilesized", onSized);`,
    `      window.removeEventListener("dryos:tileremove", onRemove);`,
    `      window.removeEventListener("dryos:tileconfigure", onConfigure);`,
    `      window.removeEventListener("pointerdown", onPress);`,
    `      window.removeEventListener("message", onHost);`,
    `    };`,
    `  }, []);`,
    ``,
    `  // How far down the arrangement actually reaches.`,
    `  let bottom = 0;`,
    `  pos.forEach((p, i) => { if (!hidden.has(i)) bottom = Math.max(bottom, p.y + p.h); });`,
    `  if (ghost) bottom = Math.max(bottom, ghost.y + ghost.h);`,
    ``,
    `  return (`,
    `    <div`,
    `      ref={grid}`,
    `      onDragOver={(e) => {`,
    `        if (!drag.current || drag.current.index === null) return;`,
    `        e.preventDefault();`,
    `        propose(e.clientX, e.clientY);`,
    `      }}`,
    `      onDrop={(e) => {`,
    `        e.preventDefault();`,
    `        const g = drag.current;`,
    `        const to = ghost;`,
    `        if (g && g.index !== null && to) {`,
    `          setPos((prev) => prev.map((p, i) =>`,
    `            i === g.index`,
    `              ? { x: to.x, y: to.y, w: p.w, h: p.h }`,
    `              : to.swap && i === to.swap.index`,
    `                ? { x: to.swap.x, y: to.swap.y, w: p.w, h: p.h }`,
    `                : p,`,
    `          ));`,
    `          if (window.parent !== window) {`,
    `            parent.postMessage({`,
    `              __dryos: "move",`,
    `              index: g.index,`,
    `              x: to.x,`,
    `              y: to.y,`,
    `              swap: to.swap ? { index: to.swap.index, x: to.swap.x, y: to.swap.y } : null,`,
    `            }, "*");`,
    `          }`,
    `        }`,
    `        drag.current = null;`,
    `        setMoving(null);`,
    `        setGhost(null);`,
    `      }}`,
    // Deep enough for everything on it, and never shallower than the frame:
    // the canvas is the drop target, so ground you can see but cannot drop on
    // is ground the arrangement does not have. The extra strip past the last
    // tile is what a page grows into.
    `      style={{`,
    `        height: bottom + (bare ? 0 : 120),`,
    `        minHeight: bare ? undefined : "calc(100vh - 32px)",`,
    `        position: "relative",`,
    `        width: "100%",`,
    `      }}`,
    `    >`,
    `      {tiles.map((tile, i) => hidden.has(i) ? null : (`,
    `        <div`,
    `          key={i}`,
    // The slot is what holds the place, so it is also what everything else
    // measures against — the resize corner, the landing, the ghost.
    `          data-slot={i}`,
    `          data-x={pos[i].x}`,
    `          data-y={pos[i].y}`,
    `          data-w={pos[i].w}`,
    `          data-h={pos[i].h}`,
    `          style={{`,
    `            height: pos[i].h,`,
    `            left: gridX(pos[i].x),`,
    `            opacity: moving === i ? 0.35 : 1,`,
    `            position: "absolute",`,
    `            top: pos[i].y,`,
    `            width: gridW(pos[i].w),`,
    // An outline, not a border: it costs the tile no layout, and it follows
    // the slot's own radius. Launched only — while editing, the pairing is
    // the wires pane's job and the border would fight the selection ring.
    `            outline: !edit && WIRE_BORDERS[i] ? "1.5px solid " + WIRE_BORDERS[i] : undefined,`,
    `            outlineOffset: -1,`,
    `            borderRadius: 8,`,
    `          }}`,
    `        >`,
    // The slot tells the tile which one it is, so useSeries can file the rows
    // it holds under the right index for the ask payload.
    `          <TileIndex.Provider value={i}>{tile}</TileIndex.Provider>`,
    `        </div>`,
    `      ))}`,
    `      {ghost && <Ghost x={ghost.x} y={ghost.y} w={ghost.w} h={ghost.h} placing={placing} />}`,
    `      {ghost && ghost.swap && (`,
    `        <Ghost x={ghost.swap.x} y={ghost.swap.y} w={ghost.swap.w} h={ghost.swap.h} trading />`,
    `      )}`,
    `    </div>`,
    `  );`,
    `}`,
    "",
  ].join("\n\n");
}

/** "a chart of Total LMP and Actual load" — what the revision records. */
export function describeComponent(
  kind: string,
  refs: DataRef[],
): string {
  const names = refs.map((r) => r.label);
  const list =
    names.length <= 1
      ? (names[0] ?? "the selected data")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const article =
    kind === "map"
      ? "a map"
      : kind === "ticker"
        ? "a live ticker"
        : `a ${kind}`;
  return `Add ${article} of ${list}.`;
}
