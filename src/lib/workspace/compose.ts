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

/** One request per selection, polled together and kept in step. */
function useSeries(queries, refreshMs) {
  const [rows, setRows] = useState(queries.map(() => []));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const out = await Promise.all(queries.map((q) => dryos.query(q)));
        if (!live) return;
        setRows(out.map((r) => r.rows));
        setError(null);
      } catch (e) {
        if (live) setError(e && e.message ? e.message : String(e));
      } finally {
        if (live) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  return { rows, error, loading };
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
function gridW(w) {
  const track = "(100% - " + (GRID_COLS - 1) * GRID_GAP + "px) / " + GRID_COLS;
  return "calc(" + track + " * " + w + " + " + (w - 1) * GRID_GAP + "px)";
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
function Section({ index, title, unit, loading, error, w, h, fill, children }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: w || 6, h: h || 240 });
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(null);
  const [full, setFull] = useState(false);
  // Stamped by buildDocument for previews: looking, not arranging.
  const bare = typeof window !== "undefined" && window.__dryosBare;

  useEffect(() => setSize({ w: w || 6, h: h || 240 }), [w, h]);

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
      let w = Math.max(2, Math.min(GRID_COLS, start.w + Math.round((ev.clientX - start.x) / (col + GRID_GAP))));
      let h = Math.max(120, Math.min(900, Math.round((start.h + (ev.clientY - start.y)) / GRID_SNAP) * GRID_SNAP));
      if (me) {
        others.forEach((o) => {
          if (o.y >= me.y && o.x < me.x + start.w && me.x < o.x + o.w) h = Math.min(h, o.y - GRID_GAP - me.y);
        });
        h = Math.max(120, h);
        w = Math.min(w, GRID_COLS - me.x);
        others.forEach((o) => {
          if (o.x >= me.x && o.y < me.y + h && me.y < o.y + o.h) w = Math.min(w, o.x - me.x);
        });
        w = Math.max(2, w);
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
        border: bare
          ? "none"
          : "1px solid " + (dragging ? "var(--accent)" : over ? "var(--info)" : "var(--line)"),
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gridColumn: "span " + size.w,
        height: size.h,
        overflow: "hidden",
        padding: 12,
        position: "relative",
      };

  return (
    <section ref={box} data-tile={index} style={frame}>
      <header style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 8 }}>
        {/*
          The header is the handle. Dragging a tile by its body would fight every
          chart underneath it for the same gesture.
        */}
        {!bare && (
        <span
          draggable={!full}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/dryos-tile", String(index));
            e.dataTransfer.effectAllowed = "move";
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
          title="Drag to move"
          style={{
            color: "var(--line-strong)",
            cursor: full ? "default" : "grab",
            fontSize: 11,
            letterSpacing: "-1px",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          ⠿
        </span>
        )}
        <h2 style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</h2>
        {unit && <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>{unit}</span>}
        {loading && <span style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10 }}>loading…</span>}
        {!bare && (
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
            marginLeft: "auto",
            padding: "3px 5px",
          }}
        >
          {full ? "✕" : "⤢"}
        </button>
        )}
        {!bare && !full && window.parent !== window && (
          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("dryos:tileconfigure", { detail: { index } }),
              )
            }
            title="Configure this component"
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
            ⚙
          </button>
        )}
        {!bare && !full && window.parent !== window && (
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
      </header>

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
  const want = {
    x: Math.max(0, Math.min(GRID_COLS - w, Math.round((px - r.left - drag.offX) / stride))),
    y: Math.max(0, Math.round((py - r.top - drag.offY) / GRID_SNAP) * GRID_SNAP),
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

function ChartTip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 6, fontSize: 12, padding: "6px 9px" }}>
      <div style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
        {new Date(label).toISOString().slice(11, 16)}Z
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: "var(--ink)" }}>
          {/* Stacked areas wear a surface-coloured stroke as the gap between
              segments, so identity lives in the fill there. */}
          <span style={{ color: p.fill && p.fill !== "none" ? p.fill : p.stroke }}>■ </span>
          {p.name}: <strong>{p.value == null ? "—" : Number(p.value).toFixed(2)}</strong> {unit}
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
function renameSection(code: string, index: number): string {
  return code
    .replace(
      /^function\s+([A-Za-z0-9_]+?)\d*\s*\(/m,
      (_m, base) => `function ${base}${index}(`,
    )
    // Only the outer frame's own tag — a refinement may reorder its props, but
    // it is still the first `<Section` in the file.
    .replace(/<Section\b[^>]*>/, (tag) =>
      tag.replace(/\bindex=\{\d+\}/, `index={${index}}`),
    );
}

export function composeApp(input: ComponentSpec[]): string {
  // Every tile gets an explicit place before anything is emitted. A page from
  // before positions existed is frozen into the arrangement the old flow grid
  // gave it — same wrap, same rows — so nothing on anyone's screen moves the
  // first time this runs.
  const manifest = packLayout(input);
  const placed = manifest.map((spec) => spec.layout as Required<NonNullable<ComponentSpec["layout"]>>);

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
      return def?.emit(spec.refs, i, withDefaults(def, spec.options));
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const imports = [...new Set(sections.flatMap((s) => s.imports))].sort();
  const recharts = imports.length
    ? `import { ${imports.join(", ")} } from "recharts";\n`
    : "";

  const names = manifest.map((spec, i) => {
    const base = spec.custom
      ? (/^function\s+([A-Za-z0-9_]+?)\d*\s*\(/m.exec(spec.custom.code)?.[1] ??
        spec.kind)
      : spec.kind;
    return `${base[0].toUpperCase()}${base.slice(1)}${i}`;
  });

  if (manifest.length === 0) {
    return `${PREAMBLE}

export default function App() {
  return (
    <div style={{ alignItems: "center", border: "1px dashed var(--line-strong)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", minHeight: 260, padding: 24, textAlign: "center" }}>
      <p style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600, margin: 0 }}>Nothing on this dashboard yet</p>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, maxWidth: 420 }}>
        Pick data in the explorer, choose a shape, and it is generated here — no model involved.
      </p>
    </div>
  );
}
`;
  }

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
      (l) => `    { x: ${l.x}, y: ${l.y}, w: ${l.w}, h: ${l.h} },`,
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
    ...names.map((n, i) => `    <${n} key={${i}} w={pos[${i}].w} h={pos[${i}].h} />,`),
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
    `      if (window.parent !== window) parent.postMessage({ __dryos: "configure", index: e.detail.index }, "*");`,
    `    };`,
    `    const onHost = (e) => {`,
    `      const m = e.data;`,
    `      if (!m || typeof m !== "object") return;`,
    `      if (m.__dryos === "restore") setHidden(new Set());`,
    `      if (m.__dryos === "dragover" && grid.current) {`,
    `        setPlacing(false);`,
    `        const r = grid.current.getBoundingClientRect();`,
    `        const stride = (r.width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS + GRID_GAP;`,
    `        // Nothing was picked up out here, so the incoming tile hangs`,
    `        // centred on the cursor rather than by a corner.`,
    `        drag.current = { index: null, w: m.w, h: m.h, offX: (m.w * stride - GRID_GAP) / 2, offY: m.h / 2 };`,
    `        const at = propose(m.x, m.y);`,
    `        if (at) parent.postMessage({ __dryos: "spot", x: at.x, y: at.y }, "*");`,
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
    `    window.addEventListener("message", onHost);`,
    `    return () => {`,
    `      window.removeEventListener("dryos:tilegrab", onGrab);`,
    `      window.removeEventListener("dryos:tiledrop", onDrop);`,
    `      window.removeEventListener("dryos:tilesized", onSized);`,
    `      window.removeEventListener("dryos:tileremove", onRemove);`,
    `      window.removeEventListener("dryos:tileconfigure", onConfigure);`,
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
    `          }}`,
    `        >`,
    `          {tile}`,
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
export function describeComponent(kind: string, refs: DataRef[]): string {
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
