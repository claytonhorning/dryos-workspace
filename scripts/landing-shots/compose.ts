// The page behind the landing captures. From frontend/:
//   ./node_modules/.bin/esbuild scripts/landing-shots/compose.ts --bundle --platform=node --format=cjs --external:esbuild --outfile=/tmp/compose.cjs
//   set -a; source .env.local; set +a; NODE_PATH=./node_modules node /tmp/compose.cjs
// Writes public/_shot/{app.js,index.html,live.html}; live.html self-serves from
// /api/workspace/data (anonymous, unmetered). Delete public/_shot afterwards.
import { communityGroups, communityComponents } from "../../src/lib/workspace/community";
import { composeApp } from "../../src/lib/workspace/compose";
import { compile, buildDocument } from "../../src/lib/workspace/runtime";
import type { ComponentSpec } from "../../src/lib/workspace/components";
import { writeFileSync } from "node:fs";

async function main() {
  const group = communityGroups().find((g) => g.id === "node-prices")!;
  const comps = communityComponents();
  const by = (id: string) => comps.find((c) => c.id === id)!;

  const [map, chart, ticker] = group.members;
  const manifest: ComponentSpec[] = [
    { kind: map.kind, refs: map.refs, options: map.options, layout: { x: 0, y: 0, w: 7, h: 440 } },
    { kind: chart.kind, refs: chart.refs, options: { ...chart.options, follow: "0", wireColor: "3" }, layout: { x: 7, y: 0, w: 5, h: 220 } },
    { kind: ticker.kind, refs: ticker.refs, options: { ...ticker.options, follow: "0", wireColor: "3" }, layout: { x: 7, y: 230, w: 2, h: 210 } },
    { kind: "bar", refs: by("load-by-zone").refs, options: by("load-by-zone").options, layout: { x: 9, y: 230, w: 3, h: 210 } },
    { kind: "chart", refs: by("fuel-mix").refs, options: { ...by("fuel-mix").options, shape: "stacked" }, layout: { x: 0, y: 450, w: 6, h: 250 } },
    { kind: "heatmap", refs: by("north-hub").refs, options: {}, layout: { x: 6, y: 450, w: 6, h: 250 } },
  ];
  const src = composeApp(manifest);
  const built = await compile(src);
  if (!built.js) { console.error(built.error); process.exit(1); }
  writeFileSync("public/_shot/app.js", built.js);
  writeFileSync("public/_shot/index.html", buildDocument("/_shot/app.js", { preview: true }));
  writeFileSync("public/_shot/live.html", buildDocument("/_shot/app.js"));
  console.log("ok", built.js.length, manifest.map((m) => m.kind).join(","));
}
main();
