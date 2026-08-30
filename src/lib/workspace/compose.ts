import { type ComponentSpec, componentDef, withDefaults } from "./components";
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
  // Removal arms on the first click and fires on the second — confirmed on the
  // tile itself, because that is the thing being deleted. It disarms on its
  // own so a stray click does not leave a live trigger lying around.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

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
    const grid = host.parentElement;
    // One column, in pixels, from the grid the tile actually sits in.
    const col = (grid.clientWidth - 11 * 12) / 12;
    const start = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    setDragging(true);

    const measure = (ev) => ({
      w: Math.max(2, Math.min(12, start.w + Math.round((ev.clientX - start.x) / (col + 12)))),
      h: Math.max(120, Math.min(900, Math.round((start.h + (ev.clientY - start.y)) / 10) * 10)),
    });

    const move = (ev) => setSize(measure(ev));
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      const final = measure(ev);
      setSize(final);
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
        border: "1px solid " + (dragging ? "var(--accent)" : over ? "var(--info)" : "var(--line)"),
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
        <span
          draggable={!full}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/dryos-tile", String(index));
            e.dataTransfer.effectAllowed = "move";
            // The grid decides where it lands; this only says what is in flight.
            window.dispatchEvent(
              new CustomEvent("dryos:tilegrab", { detail: { index, w: size.w, h: size.h } }),
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
        <h2 style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</h2>
        {unit && <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>{unit}</span>}
        {loading && <span style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10 }}>loading…</span>}
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
        {!full && window.parent !== window && (
          <button
            onClick={() => {
              if (!armed) { setArmed(true); return; }
              setArmed(false);
              parent.postMessage({ __dryos: "remove", index }, "*");
            }}
            title={armed ? "Click again to remove this tile" : "Remove from the dashboard"}
            style={{
              background: armed ? "var(--fail)" : "transparent",
              border: "1px solid " + (armed ? "var(--fail)" : "var(--line)"),
              borderRadius: 4,
              color: armed ? "var(--bg)" : "var(--faint)",
              cursor: "pointer",
              fontSize: 10,
              lineHeight: 1,
              padding: "3px 5px",
            }}
          >
            {armed ? "remove?" : "✕"}
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
      {!full && (
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

/**
 * Which gap in the grid a pointer is over.
 *
 * Nearest tile centre, then before or after by which half of it you are on.
 * Distance rather than containment because the pointer spends most of a drag in
 * the gutters between tiles and below the last row, and every one of those
 * positions still has an obvious answer.
 */
function slotAt(grid, x, y) {
  const tiles = [...grid.querySelectorAll(":scope > [data-tile]")];
  if (!tiles.length) return 0;

  let best = 0;
  let bestRect = null;
  let bestDistance = Infinity;

  tiles.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const d = dx * dx + dy * dy;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
      bestRect = r;
    }
  });

  return x < bestRect.left + bestRect.width / 2 ? best : best + 1;
}

/**
 * Where the tile will be, drawn at the size it will be.
 *
 * The grid reflows around it, so this is not a marker pointing at a position —
 * it is the position, already taken. An empty gap of the right size in the
 * right place: a "DROP HERE" inside it was the caption on a photograph of
 * itself, and it is the one thing on screen while someone is mid-drag.
 */
function Ghost({ w, h, placing }) {
  return (
    <div
      style={{
        background: "var(--accent-dim, rgba(232,255,61,.06))",
        border: "1px dashed var(--accent)",
        borderRadius: 8,
        gridColumn: "span " + (w || 6),
        height: h || 240,
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
 * Give a saved component the function name its slot expects.
 *
 * A custom component was authored standing alone, so its function is named for
 * its own kind. Two of the same kind in one dashboard would then collide, and
 * the index is what keeps them apart.
 */
function renameSection(code: string, index: number): string {
  return code.replace(
    /^function\s+([A-Za-z0-9_]+?)\d*\s*\(/m,
    (_m, base) => `function ${base}${index}(`,
  );
}

export function composeApp(manifest: ComponentSpec[]): string {
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
    ``,
    `  // Order lives here so a move lands instantly. The host saves it in the`,
    `  // background; nothing waits on that round trip.`,
    `  const [order, setOrder] = useState([${manifest.map((_, i) => i).join(", ")}]);`,
    `  // The tile being moved, and the gap it is currently headed for.`,
    `  const [grabbed, setGrabbed] = useState(null);`,
    `  const [slot, setSlot] = useState(null);`,
    `  // Dropped and being composed: the gap holds its place, pulsing, until`,
    `  // the revision that fills it replaces this frame — or the host says the`,
    `  // placement failed and releases it.`,
    `  const [placing, setPlacing] = useState(false);`,
    ``,
    `  const tiles = [`,
    ...names.map(
      (n, i) =>
        `    <${n} key={${i}} w={${manifest[i].layout?.w ?? 6}} h={${manifest[i].layout?.h ?? 240}} moving={grabbed && grabbed.index === ${i}} />,`,
    ),
    `  ];`,
    ``,
    `  // An in-frame drag announces itself; one from the host arrives by message,`,
    `  // because a drag started outside this document cannot fire events inside it.`,
    `  useEffect(() => {`,
    `    const onGrab = (e) => setGrabbed(e.detail);`,
    `    const onDrop = () => { setGrabbed(null); setSlot(null); };`,
    `    const onHost = (e) => {`,
    `      const m = e.data;`,
    `      if (!m || typeof m !== "object") return;`,
    `      if (m.__dryos === "dragover" && grid.current) {`,
    `        setPlacing(false);`,
    `        setGrabbed({ index: null, w: m.w, h: m.h });`,
    `        const at = slotAt(grid.current, m.x, m.y);`,
    `        setSlot(at);`,
    `        parent.postMessage({ __dryos: "slot", index: at }, "*");`,
    `      } else if (m.__dryos === "placed") {`,
    `        setPlacing(true);`,
    `      } else if (m.__dryos === "dragend") {`,
    `        setPlacing(false);`,
    `        onDrop();`,
    `      }`,
    `    };`,
    `    window.addEventListener("dryos:tilegrab", onGrab);`,
    `    window.addEventListener("dryos:tiledrop", onDrop);`,
    `    window.addEventListener("message", onHost);`,
    `    return () => {`,
    `      window.removeEventListener("dryos:tilegrab", onGrab);`,
    `      window.removeEventListener("dryos:tiledrop", onDrop);`,
    `      window.removeEventListener("message", onHost);`,
    `    };`,
    `  }, []);`,
    ``,
    `  function move(to) {`,
    `    if (!grabbed || grabbed.index === null) return;`,
    `    const from = grabbed.index;`,
    `    setOrder((prev) => {`,
    `      const at = prev.indexOf(from);`,
    `      if (at < 0) return prev;`,
    `      const next = prev.filter((n) => n !== from);`,
    `      next.splice(to > at ? to - 1 : to, 0, from);`,
    `      return next;`,
    `    });`,
    `    if (window.parent !== window) {`,
    `      parent.postMessage({ __dryos: "reorder", from: order.indexOf(from), to }, "*");`,
    `    }`,
    `  }`,
    ``,
    `  const shown = [];`,
    `  order.forEach((i, n) => {`,
    `    if (slot === n) shown.push(<Ghost key="ghost" w={grabbed && grabbed.w} h={grabbed && grabbed.h} placing={placing} />);`,
    `    shown.push(tiles[i]);`,
    `  });`,
    `  if (slot === order.length) shown.push(<Ghost key="ghost" w={grabbed && grabbed.w} h={grabbed && grabbed.h} placing={placing} />);`,
    ``,
    `  return (`,
    // Twelve columns, the way every dashboard grid is divided, so a tile can be
    // a third, a half or the full width without anyone doing arithmetic.
    `    <div`,
    `      ref={grid}`,
    `      onDragOver={(e) => {`,
    `        if (!grabbed || grabbed.index === null) return;`,
    `        e.preventDefault();`,
    `        setSlot(slotAt(grid.current, e.clientX, e.clientY));`,
    `      }}`,
    `      onDrop={(e) => {`,
    `        e.preventDefault();`,
    `        if (slot !== null) move(slot);`,
    `        setGrabbed(null);`,
    `        setSlot(null);`,
    `      }}`,
    `      style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(12, 1fr)", minHeight: "100%" }}`,
    `    >`,
    `      {shown}`,
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
