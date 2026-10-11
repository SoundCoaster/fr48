import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { TrafficService } from "./traffic-service";

/** Methods exposed both by the Durable Object (RPC) and the local fallback. */
export interface TrafficApi {
  flights(): Promise<string>;
  flight(callsign: string): Promise<string | null>;
  airport(code: string): Promise<string | null>;
  airports(): Promise<string>;
  search(q: string): Promise<string>;
}

const g = globalThis as unknown as { __fr48Traffic?: TrafficService };

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
  g.__fr48Traffic ??= new TrafficService();
  return g.__fr48Traffic;
}

export function json(body: string, maxAge = 5): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
}
