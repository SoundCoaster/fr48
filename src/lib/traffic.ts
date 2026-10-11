import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Methods exposed both by the Durable Object (RPC) and the local fallback. */
export interface TrafficApi {
  flights(): Promise<string>;
  flight(callsign: string): Promise<string | null>;
  airport(code: string): Promise<string | null>;
  airports(): Promise<string>;
  search(q: string): Promise<string>;
}

type Local = TrafficApi;
const g = globalThis as unknown as { __fr48Traffic?: Promise<Local> };

/**
 * In-process fallback for `next dev`. Loaded lazily and only in development so
 * the airport/airline database never ends up in the production Next bundle
 * (the Durable Object has its own copy).
 */
function local(): Promise<Local> {
  if (process.env.NODE_ENV !== "development") {
    return Promise.reject(new Error("TRAFFIC Durable Object binding is missing"));
  }
  g.__fr48Traffic ??= import("./traffic-service").then((m) => new m.TrafficService());
  return g.__fr48Traffic;
}

const localApi: TrafficApi = {
  flights: async () => (await local()).flights(),
  flight: async (cs) => (await local()).flight(cs),
  airport: async (code) => (await local()).airport(code),
  airports: async () => (await local()).airports(),
  search: async (q) => (await local()).search(q),
};

/**
 * On Cloudflare the single global Durable Object keeps flight trails across
 * requests. Locally (`next dev`) a process-wide singleton does the same job.
 */
export function traffic(): TrafficApi {
  try {
    const ns = getCloudflareContext().env.TRAFFIC;
    if (ns) return ns.get(ns.idFromName("global")) as unknown as TrafficApi;
  } catch {
    // Not running on Cloudflare
  }
  return localApi;
}

export function json(body: string, maxAge = 5): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
}
