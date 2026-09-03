import type { NextConfig } from "next";
import path from "node:path";

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
  // is a few kilobytes, and any of them may come to read a template.
  outputFileTracingIncludes: {
    "/api/workspace/**": ["./src/lib/workspace/templates/*.txt"],
  },
};

export default nextConfig;
