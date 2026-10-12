import { aircraftInfo } from "@/data/aircraft";
import { USER_AGENT, VATSIM_FEED } from "./constants";
import { registration } from "./registration";
import type { FlightRow, FlightsResponse, VatsimFeed } from "./types";

/**
 * Stateless live flights straight from the VATSIM feed, used when the
 * Durable Object is unavailable (e.g. free-tier quota exceeded). No trails,
 * history or viewer counts; just enough to keep the map alive.
 */
export async function fallbackFlights(): Promise<string> {
  const res = await fetch(VATSIM_FEED, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`VATSIM feed HTTP ${res.status}`);
  const feed = (await res.json()) as VatsimFeed;
  const flights: FlightRow[] = [];
  for (const p of feed.pilots) {
    if (p.latitude === 0 && p.longitude === 0) continue;
    const type = p.flight_plan?.aircraft_short || "";
    flights.push([
      p.callsign,
      p.latitude,
      p.longitude,
      p.heading,
      p.altitude,
      p.groundspeed,
      type,
      p.flight_plan?.departure || "",
      p.flight_plan?.arrival || "",
      p.transponder,
      0,
      p.groundspeed < 50 ? 1 : 0,
      aircraftInfo(type).silhouette,
      registration(p.flight_plan?.remarks) || "",
    ]);
  }
  const body: FlightsResponse = {
    updated: feed.general.update_timestamp,
    serverTime: Date.now(),
    stats: { pilots: feed.pilots.length, controllers: feed.controllers.length + feed.atis.length, users: feed.general.unique_users },
    flights,
    tracked: [],
    busiest: [],
  };
  return JSON.stringify(body);
}

/**
 * One-shot traffic store built from the current feed (cached ~15 s per
 * isolate), for detail routes when the Durable Object is unavailable.
 * Loaded lazily so the airport database only lands in those route chunks.
 */
let cachedStore: { at: number; store: Promise<import("./traffic-store").TrafficStore> } | null = null;

export function fallbackStore() {
  if (!cachedStore || Date.now() - cachedStore.at > 15_000) {
    cachedStore = {
      at: Date.now(),
      store: (async () => {
        const [{ TrafficStore }, res] = await Promise.all([
          import("./traffic-store"),
          fetch(VATSIM_FEED, { headers: { "user-agent": USER_AGENT } }),
        ]);
        if (!res.ok) throw new Error(`VATSIM feed HTTP ${res.status}`);
        const store = new TrafficStore();
        store.ingest((await res.json()) as VatsimFeed);
        return store;
      })(),
    };
    cachedStore.store.catch(() => (cachedStore = null));
  }
  return cachedStore.store;
}
