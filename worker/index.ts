// Custom Worker entry: the OpenNext-generated Next.js handler plus our Durable Object.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "../.open-next/worker.js";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;

export { TrafficTracker } from "./traffic-do";
