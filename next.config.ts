import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / partial prerendering are not yet reliable on
  // @opennextjs/cloudflare (pages hang in workerd). All live data is fetched
  // client-side, so classic rendering is all we need.
  cacheComponents: false,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: { unoptimized: true },
};

export default nextConfig;
