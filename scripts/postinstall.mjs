// Runs after `npm install`.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

// 1. MapLibre locates its web worker relative to its own module URL, which
//    bundlers break. Serve the worker as a static file instead.
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");

// 2. @opennextjs/cloudflare <= 1.20.10 does not inline `.next/server/preview-props.json`
//    (new in Next.js 16.4), so the Worker crashes with "Unexpected loadManifest".
//    Remove once upstream ships the fix.
const file = "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js";
if (existsSync(file)) {
  const src = readFileSync(file, "utf8");
  const from = "{*-manifest,required-server-files,prefetch-hints}.json";
  if (src.includes(from)) {
    writeFileSync(file, src.replace(from, "{*-manifest,required-server-files,prefetch-hints,preview-props}.json"));
    console.log("patched @opennextjs/cloudflare load-manifest (preview-props.json)");
  }
}
