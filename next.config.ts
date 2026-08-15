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
};

export default nextConfig;
