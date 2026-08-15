import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next infer the wrong workspace
  // root; pin it to this project.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
