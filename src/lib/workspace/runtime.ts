import * as esbuild from "esbuild";
import { SCHEMAS } from "./catalog";
import { seriesVars } from "./palette";

/**
 * The sandbox an app runs in.
 *
 * An app is one React component with no network access of its own. It reaches
 * data through a `dryos` object that posts a message to the parent frame, which
 * does the fetching and posts the rows back. That indirection is the whole
 * security model and it is worth more than it costs: the app never sees a
 * credential, cross-origin never arises, and every data call passes through one
 * place that could meter, cache or deny it.
 *
 * It is also a better authoring target. The agent writing these apps has one
 * documented async function to reach for instead of a fetch, a base URL, an
 * auth header and a schema it has to remember.
 */

/** Injected before the app bundle. Implements `dryos` over postMessage. */
export const RUNTIME_SHIM = String.raw`
(function () {
  var pending = {};
  var seq = 0;

  /*
    The page's time cursor: which instant every tile on this screen is about.

    It is applied here rather than in generated code, and that is the whole
    reason it works at all. Every component already asks for a window ending
    now; rewriting the request on its way out means a chart written months ago,
    a map, a ticker and somebody's model-edited page all scrub together without
    one of them being recompiled or even knowing the feature exists.

    Two rewrites, and the second is the one that is easy to forget. 'end'
    becomes the cursor, so a query stops at the instant being looked at instead
    of at now. And a *relative* 'start' — "-24h" — is resolved against the
    cursor too, because "the last 24 hours" means the 24 hours before the
    instant on screen, not before the wall clock. Rewriting only 'end' would
    slide the window's far edge while pinning its near one, stretching every
    chart as it scrubbed.

    Null is live, and then nothing is rewritten at all: a screen with no cursor
    behaves exactly as it did before there was one.
  */
  var cursor = null;
  var RELATIVE = /^-(\d+)([mhd])$/;

  function shift(value, at) {
    var m = RELATIVE.exec(String(value == null ? "" : value).trim());
    if (!m) return value;
    var n = Number(m[1]);
    var ms = m[2] === "m" ? n * 60000 : m[2] === "h" ? n * 3600000 : n * 86400000;
    return new Date(at - ms).toISOString();
  }

  function atCursor(opts) {
    var at = cursor ? Date.parse(cursor) : NaN;
    if (!at) return opts;
    var out = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) out[k] = opts[k];
    out.end = cursor;
    if (out.start) out.start = shift(out.start, at);
    return out;
  }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (m && m.__dryos === "cursor") {
      var next = m.at || null;
      if (next === cursor) return;
      cursor = next;
      // Readable by components that want to *show* the instant, not just query
      // at it — a scrubber on a tile has to know where its own handle goes.
      if (window.dryos) window.dryos.cursor = cursor;
      // Every hook refetches off this rather than waiting for its own poll —
      // a five-minute tile would otherwise sit on the old instant long after
      // the scrub that moved it.
      window.dispatchEvent(new Event("dryos:cursor"));
      return;
    }
    if (!m || m.__dryos !== "result") return;
    var p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.data);
  });

  // Opened directly rather than embedded, the document is same-origin with the
  // host and can serve itself. That makes the bundle URL a working preview you
  // can share, and costs nothing in the embedded case: inside the frame there
  // is a parent, so the message path is used and the app still has no
  // credentials and no reachable API of its own.
  var standalone = window.parent === window;

  function call(op, payload) {
    if (standalone) {
      return fetch("/api/workspace/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || "Query failed");
          return j;
        });
      });
    }
    var id = ++seq;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ __dryos: "call", id: id, op: op, payload: payload }, "*");
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error("Dryos request timed out"));
        }
      }, 30000);
    });
  }

  window.dryos = {
    query: function (opts) { return call("query", atCursor(opts || {})); },
    /** The instant the page is showing, or null for live. Read, do not assign. */
    cursor: null,
    /*
      Move the page's cursor from inside a tile.

      Nothing generated calls this today: the map's scrubber holds a tile-local
      instant instead (its useSeries rewrites only that tile's queries), because
      scrubbing one map was a question about the map, not an instruction to the
      dashboard. This stays for anything that genuinely means "move the whole
      screen": it posts an intent outward and waits to be told, the same shape
      as resize, move and remove.

      Standalone there is no parent to ask, so it self-serves — which is what
      makes a page-wide scrubber work on a shared bundle URL.
    */
    setCursor: function (at) {
      var next = at || null;
      if (standalone) {
        cursor = next;
        window.dryos.cursor = cursor;
        window.dispatchEvent(new Event("dryos:cursor"));
        return;
      }
      parent.postMessage({ __dryos: "cursor-set", at: next }, "*");
    },
    HUBS: ["HB_HOUSTON","HB_NORTH","HB_SOUTH","HB_WEST","HB_PAN","HB_BUSAVG","HB_HUBAVG"],
    ZONES: ["LZ_AEN","LZ_CPS","LZ_HOUSTON","LZ_LCRA","LZ_NORTH","LZ_RAYBN","LZ_SOUTH","LZ_WEST"]
  };

  // Surface errors to the host rather than losing them inside the frame.
  window.addEventListener("error", function (e) {
    parent.postMessage({ __dryos: "error", message: String(e.message) }, "*");
  });
  window.addEventListener("unhandledrejection", function (e) {
    parent.postMessage({
      __dryos: "error",
      message: String((e.reason && e.reason.message) || e.reason)
    }, "*");
  });
})();
`;

/**
 * The shim a thumbnail gets instead.
 *
 * A preview has no host. Thumbnails and the landing page frame an app with
 * nothing listening for its messages, so every `dryos.query` posted into the
 * void and died on the 30-second timeout — which is why every tile on the shelf
 * read "Dryos request timed out" rather than showing an app.
 *
 * So a preview serves itself. It generates rows locally from the catalogue's
 * declared shapes, which also means a wall of twelve thumbnails costs zero
 * queries and bills nothing — the alternative was twelve frames hammering the
 * live feed to draw pictures the size of a postcard.
 *
 * The numbers are therefore NOT real, including for the live schema, and every
 * surface that mounts a preview says so on the tile. The generator deliberately
 * mirrors `mockData.ts` in shape but is not shared with it: nothing ever
 * compares a preview against stored rows, so agreeing exactly would buy nothing
 * and force the real generator into a string.
 */
const PREVIEW_SHAPES = JSON.stringify(
  Object.fromEntries(
    SCHEMAS.flatMap((s) => {
      const fields = s.variables.filter((v) => v.mock);
      if (!fields.length) return [];
      const entry = {
        step: s.cadence.seconds * 1000,
        nodes: s.entities.sample,
        fields: fields.map((v) => ({ key: v.key, ...v.mock! })),
        others: s.variables.filter((v) => !v.mock).map((v) => v.key),
      };
      // Reachable by schema id and by collector slug, because apps use both.
      return s.dataset ? [[s.id, entry], [s.dataset, entry]] : [[s.id, entry]];
    }),
  ),
);

export const PREVIEW_SHIM = String.raw`
(function () {
  var SHAPES = ` + PREVIEW_SHAPES + String.raw`;
  var HUBS = ["HB_HOUSTON","HB_NORTH","HB_SOUTH","HB_WEST","HB_PAN","HB_BUSAVG","HB_HUBAVG"];
  var ZONES = ["LZ_AEN","LZ_CPS","LZ_HOUSTON","LZ_LCRA","LZ_NORTH","LZ_RAYBN","LZ_SOUTH","LZ_WEST"];

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function value(spec, node, at, step) {
    var day = (at % 86400000) / 86400000;
    var diurnal = Math.sin((day - 0.25) * 2 * Math.PI);
    var slow = Math.sin(at / 259200000 + hash(node) * 6.283);
    var shape = step < 43200000 ? diurnal * 0.7 + slow * 0.3 : slow;
    var offset = (hash(node + ":" + spec.key) - 0.5) * 2;
    var jitter = (hash(node + ":" + spec.key + ":" + at) - 0.5) * 2 * spec.noise;
    var raw = spec.base * (1 + offset * 0.12) + spec.swing * shape + jitter;
    var out = spec.floor === undefined ? raw : Math.max(spec.floor, raw);
    return Math.round(out * 1000) / 1000;
  }

  function query(opts) {
    opts = opts || {};
    var shape = SHAPES[opts.dataset] || SHAPES["ercot-realtime-lmp"];
    var step = shape.step;
    var asked = opts.node == null ? [] : [].concat(opts.node);
    var nodes = asked.length ? asked : shape.nodes;
    var limit = Math.min(opts.limit || 200, 500);

    var m = /^-(\d+)([mhd])$/.exec(String(opts.start || "-24h"));
    var span = m
      ? Number(m[1]) * (m[2] === "m" ? 6e4 : m[2] === "h" ? 36e5 : 864e5)
      : 864e5;
    var end = Math.floor(Date.now() / step) * step;
    var rows = [];

    for (var n = 0; n < nodes.length; n++) {
      for (var i = 0; i < limit; i++) {
        var at = end - i * step;
        if (at < end - span) break;
        var row = {
          interval_start_utc: new Date(at).toISOString(),
          node: nodes[n],
          node_type: "HUB",
          collected_at_utc: new Date(at + 20000).toISOString()
        };
        for (var f = 0; f < shape.fields.length; f++) {
          row[shape.fields[f].key] = value(shape.fields[f], nodes[n], at, step);
        }
        for (var o = 0; o < shape.others.length; o++) row[shape.others[o]] = null;
        rows.push(row);
      }
    }
    return Promise.resolve({ rows: rows, count: rows.length, preview: true });
  }

  window.dryos = { query: query, HUBS: HUBS, ZONES: ZONES };

  window.addEventListener("error", function (e) {
    if (window.parent !== window) {
      parent.postMessage({ __dryos: "error", message: String(e.message) }, "*");
    }
  });
})();
`;

/**
 * Ground styles, so an app looks like it belongs without being told to.
 *
 * Both palettes ship, because the frame cannot read the host's theme. It is an
 * opaque origin with no access to the parent document, so the host has to say —
 * and until it does, `prefers-color-scheme` is the best guess available. An
 * explicit `data-t` beats both, which is what the host sets once it has spoken.
 *
 * Every app is written against these variable names and nothing else, so a
 * component authored months ago follows the theme without being touched.
 */
const TOKENS_DARK = `
  --bg:#0a0d12; --surface:#10141b; --surface-2:#171d26; --line:#26303d;
  --line-strong:#3d4b5c; --ink:#eef2f7; --muted:#9aa8ba; --faint:#8998ab;
  --accent:#e8ff3d; --warn:#fbbf24; --info:#7dd3fc; --fail:#f4666b;
  ${seriesVars("dark")}
`;

/*
  --s1..--s8 are the chart series slots, written from `palette.ts` rather than
  spelled out here: the panel has to draw the same eight to offer them, and it
  cannot read this stylesheet — it belongs to another document. See that file
  for why the order is load-bearing.
*/
const TOKENS_LIGHT = `
  --bg:#ffffff; --surface:#ffffff; --surface-2:#f4f6f8; --line:#dde3ea;
  --line-strong:#aeb9c6; --ink:#0f141b; --muted:#4a5666; --faint:#586474;
  --accent:#5b6f0c; --warn:#a16207; --info:#0b6a94; --fail:#b3261e;
  ${seriesVars("light")}
`;

const BASE_CSS = String.raw`
:root {
  ${TOKENS_DARK}
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: light) {
  :root:not([data-t="dark"]) { ${TOKENS_LIGHT} }
}
:root[data-t="light"] { ${TOKENS_LIGHT} }
:root[data-t="dark"] { ${TOKENS_DARK} }

* { box-sizing: border-box; }
html, body { margin:0; height:100%; }
body {
  background: var(--bg); color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px; line-height: 1.55; -webkit-font-smoothing: antialiased;
}
#root { min-height: 100%; padding: 16px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align:left; padding:6px 10px 6px 0; border-bottom:1px solid var(--line); }
th { font-family: var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:400; }
/* recharts 3 makes every chart focusable for its keyboard layer, and a click
   on the plot focuses it — which drew the browser's blue ring around the
   chart as if it were selected. Nothing on a tile answers the keyboard. */
.recharts-wrapper, .recharts-wrapper *:focus, .recharts-surface:focus { outline: none; }
/* A dropped tile's gap breathes while its revision composes — see Ghost. */
@keyframes dr-ghost { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/*
  The empty screen in the editor, which is the one screen with nothing to say
  for itself. Two animations and no paragraph: the ground drifts so the canvas
  reads as a live surface rather than a broken one, and a component slides
  into an empty slot on a loop — the gesture, performed, in less time than the
  sentence describing it takes to read. Previews never animate: a thumbnail is
  looked at, not arranged, so its empty state is a still gradient and a line
  of text (see composeApp's bare branch).
*/
@keyframes dr-drift {
  0%, 100% { transform: translate3d(-3%, -2%, 0) scale(1.06); }
  50%      { transform: translate3d(3%, 2%, 0) scale(1.18); }
}
@keyframes dr-drop {
  0%        { transform: translate(78px, -38px) scale(0.92); opacity: 0; }
  16%       { opacity: 1; }
  52%, 76%  { transform: none; opacity: 1; }
  100%      { transform: none; opacity: 0; }
}
@keyframes dr-slot {
  0%, 46%, 100% { border-color: var(--line-strong); }
  56%, 74%      { border-color: var(--accent); }
}
.dr-drift { animation: dr-drift 24s ease-in-out infinite; }
.dr-drop  { animation: dr-drop 4.4s cubic-bezier(.22,.61,.36,1) infinite; }
.dr-slot  { animation: dr-slot 4.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .dr-drift, .dr-drop, .dr-slot { animation: none; }
}
`;

/**
 * How the frame is told which theme to wear.
 *
 * Injected into both shims. A `?theme=` on the document URL covers the first
 * paint — a thumbnail has no host to ask — and a message covers the rest, since
 * the host's theme can change while a frame is open.
 */
const THEME_SHIM = String.raw`
(function () {
  function apply(v) {
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-t", v);
    else document.documentElement.removeAttribute("data-t");
  }
  var initial = new URLSearchParams(location.search).get("theme");
  if (initial) apply(initial);

  /*
    The display timezone rides the same two channels as the theme, for the
    same reasons: "?tz=" covers the first paint, a message covers a change
    made while the frame is open. The value is "source" (each component
    resolves its own stream's timezone) or an IANA name the host already
    resolved — the frame never guesses at the viewer's locale itself.
  */
  window.__dryosTz = new URLSearchParams(location.search).get("tz") || "source";

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (m && m.__dryos === "theme") apply(m.value);
    if (m && m.__dryos === "tz") {
      window.__dryosTz = m.value || "source";
      window.dispatchEvent(new Event("dryos:tz"));
    }
  });
})();
`;

export interface CompileResult {
  js?: string;
  error?: string;
}

/**
 * Bundles the app with React into a single self-contained script.
 *
 * React 19 ships no UMD build, so the frame cannot just load React from a tag —
 * bundling per revision is the simplest correct answer, and it means the frame
 * has exactly one script and no module resolution of its own.
 */
export async function compile(source: string): Promise<CompileResult> {
  const resolveDir = process.cwd();
  try {
    const result = await esbuild.build({
      stdin: {
        contents: [
          `import React from "react";`,
          `import { createRoot } from "react-dom/client";`,
          `import App from "virtual:app";`,
          `createRoot(document.getElementById("root")).render(React.createElement(App));`,
        ].join("\n"),
        resolveDir,
        loader: "js",
      },
      bundle: true,
      format: "iife",
      write: false,
      minify: false,
      jsx: "automatic",
      target: ["es2020"],
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "virtual-app",
          setup(build) {
            build.onResolve({ filter: /^virtual:app$/ }, () => ({
              path: "app",
              namespace: "dryos-app",
            }));
            build.onLoad({ filter: /.*/, namespace: "dryos-app" }, () => ({
              contents: source,
              loader: "tsx",
              resolveDir,
            }));
          },
        },
      ],
    });
    return { js: result.outputFiles?.[0]?.text };
  } catch (err) {
    const e = err as esbuild.BuildFailure;
    const first = e.errors?.[0];
    const where = first?.location
      ? ` (line ${first.location.line}: ${first.location.lineText.trim()})`
      : "";
    return { error: `${first?.text ?? String(err)}${where}` };
  }
}

/**
 * The document handed to the iframe.
 *
 * The app bundle is referenced rather than inlined, and that is not a
 * preference. React's own source contains the literal text `<script>`, which
 * puts the HTML tokenizer into its double-escaped script state — after which
 * the closing tag no longer ends the element and the rest of the document is
 * swallowed as script text. A `src` sidesteps the escaping problem entirely and
 * lets the browser cache the bundle between reloads.
 *
 * The shim stays inline: it is small, contains no tag-like text, and has to
 * exist before the app runs.
 */
export function buildDocument(
  scriptUrl: string,
  opts?: { preview?: boolean; bare?: boolean; naked?: boolean },
) {
  const shim = opts?.preview ? PREVIEW_SHIM : RUNTIME_SHIM;
  // A preview is for looking, not arranging: `bare` strips the tile chrome —
  // drag handle, resize corner, remove, configure, full-screen — so the
  // component fills its box and offers nothing that would not work here.
  //
  // `naked` goes one step further, and only for the build and edit preview
  // panes: the tile's own title, padding and border go too, along with the
  // component's own keys and controls — legends, layer switches, scrubbers.
  // The pane is a few hundred pixels tall and every one of those spent on
  // chrome is a pixel the thing being judged does not get. It implies `bare`,
  // because everything `bare` strips is a superset of nothing here.
  const naked = Boolean(opts?.naked);
  const bare =
    opts?.bare || naked
      ? `<script>window.__dryosBare=true;${naked ? "window.__dryosNaked=true;" : ""}</script>`
      : "";

  // The one credential an app is handed, and only because of what it is: a
  // Mapbox public token is meant to be read by the browser drawing the map, and
  // is restricted by URL on Mapbox's side rather than by hiding it. Everything
  // else still goes through the host. Absent, the map component says so instead
  // of failing silently.
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const grant = `<script>window.dryos.MAPBOX_TOKEN=${JSON.stringify(token)};</script>`;

  // Written into an attribute, so the query string's separators are escaped
  // rather than left for the HTML parser to guess at — a URL carrying more
  // than one parameter is otherwise a run of would-be entity references.
  const src = scriptUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  // The document's own gutter goes with the tile's: naked, the widget is meant
  // to reach the edges of the pane it is framed in.
  const nakedCss = naked ? "#root{padding:0;min-height:0}" : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${nakedCss}</style></head><body><div id="root"></div>${bare}<script>${THEME_SHIM}</script><script>${shim}</script>${grant}<script src="${src}"></script></body></html>`;
}

/** Shown in place of the app when a revision will not build. */
export function errorScript(message: string) {
  return `document.getElementById("root").innerHTML =
    '<pre style="color:#f4666b;font:12px ui-monospace,monospace;white-space:pre-wrap;margin:0">' +
    ${JSON.stringify(message)}.replace(/&/g,"&amp;").replace(/</g,"&lt;") + '</pre>';`;
}
