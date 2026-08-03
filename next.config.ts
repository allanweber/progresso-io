import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a minimal standalone server bundle for self-hosting.
  // https://nextjs.org/docs/app/guides/self-hosting
  output: "standalone",
};

export default nextConfig;
