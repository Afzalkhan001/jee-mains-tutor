import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  // Avoid monorepo/workspace root inference issues on Windows when other lockfiles exist.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
