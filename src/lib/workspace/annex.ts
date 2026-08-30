import { PREAMBLE } from "./compose";
import {
  DEFAULT_LAYOUT,
  componentDef,
  withDefaults,
  type ComponentSpec,
} from "./components";

/**
 * Mount a generated component on a page whose file no model can regenerate.
 *
 * Composed pages splice into their manifest and rewrite the whole file — total
 * generation, the load-bearing decision. But a template never had a manifest
 * and a model-edited page lost its own, and sending a *typed* drop through the
 * agent for those was paying a model to retype forty deterministic lines.
 *
 * So this appends instead of weaving. The page's own component is left
 * byte-for-byte intact — its default export is demoted to a plain function —
 * and a wrapper `App` renders it full-width with the new tiles on a
 * twelve-column grid beneath. Everything the tile needs rides along in a
 * `__dx`-prefixed copy of the generated runtime, so nothing collides with
 * whatever helpers the page already defines, and recharts arrives as a
 * namespace import beside whatever the page already imported.
 *
 * The same compile gate applies as everywhere else: if the result does not
 * build, nothing is saved and the page keeps running what it had. That gate is
 * what makes textual surgery tolerable — the failure mode is a refusal, never
 * a silently corrupted dashboard.
 */

const MARKER = "/* dryos:annex */";
const SLOT = "{/* dryos:annex-slot */}";

/** Helpers the generated runtime defines, renamed so they cannot collide. */
const HELPERS = [
  "useSeries",
  "useMapbox",
  "useFrameTheme",
  "Section",
  "GRID_COLS",
  "GRID_GAP",
  "GRID_SNAP",
  "gridX",
  "gridW",
  "tileRects",
  "tileOverlaps",
  "tileLanding",
  "Ghost",
  "ChartTip",
];

/** Recharts components a generated or refined section may render. */
const RECHARTS = [
  "ResponsiveContainer",
  "CartesianGrid",
  "ComposedChart",
  "ReferenceLine",
  "ReferenceArea",
  "LineChart",
  "AreaChart",
  "BarChart",
  "PieChart",
  "RadialBarChart",
  "RadialBar",
  "Scatter",
  "Tooltip",
  "Legend",
  "XAxis",
  "YAxis",
  "Line",
  "Area",
  "Bar",
  "Pie",
  "Cell",
];

/** Prefix helper names, bare hook calls and recharts JSX with annex-safe forms. */
function namespaced(code: string): string {
  let out = code;
  for (const name of HELPERS) {
    out = out.replace(
      new RegExp(`(?<![.\\w])${name}\\b`, "g"),
      `__dx${name[0].toUpperCase()}${name.slice(1)}`,
    );
  }
  // The annex cannot extend the page's own React import — templates under the
  // automatic JSX runtime may not import React at all — so it ships its own
  // namespace import and every hook reads off that, whether the generated code
  // said `useState` or `React.useState`.
  out = out.replace(/\bReact\./g, "__dxReact.");
  out = out.replace(
    /(?<![.\w])\b(useState|useEffect|useMemo|useRef|useCallback)\b/g,
    "__dxReact.$1",
  );
  // Recharts only ever appears as JSX in generated and refined sections, so
  // rewriting element positions alone avoids touching the words inside titles.
  out = out.replace(
    new RegExp(`(<\\/?)(${RECHARTS.join("|")})\\b`, "g"),
    "$1__dxR.$2",
  );
  return out;
}

/** The renamed runtime, minus the import line the page already provides. */
function runtime(): string {
  const body = PREAMBLE.split("\n").slice(1).join("\n");
  return namespaced(body);
}

export function hasAnnex(source: string): boolean {
  return source.includes(MARKER);
}

/**
 * Return the page's source with one more generated tile mounted beneath it.
 * Throws when the file has no recognisable default export — the caller turns
 * that into a refusal, not an agent call.
 */
export function annexComponent(source: string, spec: ComponentSpec): string {
  const def = componentDef(spec.kind);
  if (!def) throw new Error(`unknown component kind ${spec.kind}`);
  const options = withDefaults(def, spec.options);
  const layout = spec.layout ?? DEFAULT_LAYOUT[spec.kind];

  let out = source;

  if (!hasAnnex(out)) {
    out = demoteDefaultExport(out);
    out += [
      "",
      "",
      MARKER,
      'import * as __dxReact from "react";',
      'import * as __dxR from "recharts";',
      "",
      runtime(),
      "",
      "export default function App() {",
      "  return (",
      '    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(12, 1fr)", minHeight: "100%" }}>',
      '      <div style={{ gridColumn: "1 / -1" }}><__DryosPage /></div>',
      `      ${SLOT}`,
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
  }

  // Number the new section after whatever the annex already holds.
  const index = (out.match(/function __DxSection\d+\(/g) ?? []).length;
  const name = `__DxSection${index}`;

  // A saved custom component ships its finished source; a typed one is
  // generated fresh. Either way it is one section function whose own name is
  // the first thing declared, which is all the rename needs.
  const emitted = spec.custom?.code ?? def.emit(spec.refs, index, options).code;
  const original = /function\s+([A-Za-z0-9_]+)\s*\(/.exec(emitted)?.[1];
  if (!original)
    throw new Error("the generated component had no function to mount");
  const section = namespaced(emitted).replace(
    new RegExp(`(?<![.\\w])${original.replace(/[$]/g, "\\$&")}\\b`, "g"),
    name,
  );

  out = out.replace(
    SLOT,
    `<${name} w={${layout.w}} h={${layout.h}} />\n      ${SLOT}`,
  );
  return `${out}\n${section}\n`;
}

/**
 * Turn the page's default export into a plain component the wrapper can render.
 * Handles the two shapes every app file in this product has ever used.
 */
function demoteDefaultExport(source: string): string {
  const fn = /export default function\s+([A-Za-z0-9_]+)\s*\(/.exec(source);
  if (fn) {
    const name = fn[1] === "App" ? "__DryosPage" : fn[1];
    const demoted = source.replace(fn[0], `function ${name}(`);
    return name === "__DryosPage"
      ? demoted
      : demoted + `\n\nconst __DryosPage = ${name};\n`;
  }
  const named = /export default\s+([A-Za-z0-9_]+)\s*;/.exec(source);
  if (named) {
    return source.replace(named[0], `const __DryosPage = ${named[1]};`);
  }
  throw new Error("this page has no default export to build on");
}
