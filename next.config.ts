import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite and pg run server-side only; keep them out of the bundler.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
