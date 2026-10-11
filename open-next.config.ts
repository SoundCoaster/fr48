import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  // `npm run build` is the OpenNext build itself (that is what Cloudflare
  // Workers Builds runs), so the inner Next.js build must not call it again.
  buildCommand: "npx next build",
};
