import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// The sandbox compiles every app at request time (`lib/workspace/runtime.ts`):
// esbuild resolves `react`, `react-dom/client` and `recharts` from
// `process.cwd()` when the bundle is asked for, not when the site is built.
// Webpack never sees those imports — they sit inside a template string handed
// to esbuild — so the build's file tracer copies none of them into the
// deployed function, and the first request there fails with
// `Could not resolve "react-dom/client"`. Locally `node_modules` is simply
// there, which is why it passed. The closure is walked from the lockfile's
// installed tree rather than listed by hand so a recharts upgrade that adds a
// dependency cannot quietly break production again.
function sandboxPackages(): string[] {
  const seen = new Set<string>();
  const queue = ["react", "react-dom", "recharts"];
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    const file = path.join(__dirname, "node_modules", name, "package.json");
    if (!fs.existsSync(file)) continue;
    seen.add(name);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const optional = pkg.peerDependenciesMeta ?? {};
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push(dep);
    for (const dep of Object.keys(pkg.peerDependencies ?? {})) {
      if (!optional[dep]?.optional) queue.push(dep);
    }
  }
  return [...seen].sort().map((name) => `./node_modules/${name}/**`);
}

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next infer the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: path.join(__dirname),

  // `dev` and `build` share .next by default, so a verification build run while
  // the dev server is up overwrites the chunks it is serving — the dev server
  // then dies with "__webpack_modules__[moduleId] is not a function" until it is
  // restarted. `npm run build:check` sets this to keep the two apart.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // esbuild ships its TypeScript declarations next to its entry point and
  // resolves its platform binary at runtime, so webpack tries to parse `.d.ts`
  // as JavaScript and fails. Leaving it external means Node `require`s it
  // directly, which is what it expects.
  serverExternalPackages: ["esbuild"],

  // The starter templates are `.txt` files read with `fs` at request time
  // (`lib/workspace/templates`). The path is built from a variable, so the
  // build's file tracer never sees them and a serverless function creating a
  // page from a template finds no file. Every workspace route gets them; it
  // is a few kilobytes, and any of them may come to read a template. The
  // workspace MCP server (`/api/mcp`) compiles every tile it adds, so it needs
  // the same closure — outside `/api/workspace` it had none, and every
  // `add_tile` in production failed on `react-dom/client`.
  outputFileTracingIncludes: {
    "/api/workspace/**": [
      "./src/lib/workspace/templates/*.txt",
      ...sandboxPackages(),
    ],
    "/api/mcp": [
      "./src/lib/workspace/templates/*.txt",
      ...sandboxPackages(),
    ],
  },
};

export default nextConfig;
