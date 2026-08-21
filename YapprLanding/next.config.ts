import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Silences "multiple lockfiles detected" warning by pinning the workspace root.
    root: path.join(__dirname),
  },
};

export default nextConfig;
