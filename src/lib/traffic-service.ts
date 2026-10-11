import { airportDetail, airportRows, flightDetail, flightRows, search } from "./derive";
import { TrafficStore } from "./traffic-store";
import type { VatsimFeed } from "./types";

export const VATSIM_FEED = "https://data.vatsim.net/v3/vatsim-data.json";
export const USER_AGENT = "FlightRadar48/1.0 (+https://github.com/SoundCoaster/fr48)";
/** VATSIM publishes a new snapshot every 15 seconds. */
export const REFRESH_MS = 15_000;

/**
 * Owns the traffic store, keeps it fed from VATSIM, and serialises the API
 * payloads. Runs inside the Durable Object in production and as a process
 * singleton during `next dev`.
 */
export class TrafficService {
  store = new TrafficStore();
  private lastFetch = 0;
  private inflight: Promise<void> | null = null;
  private cache = new Map<string, { version: number; body: string }>();

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const res = await fetch(VATSIM_FEED, { headers: { "user-agent": USER_AGENT } });
        if (!res.ok) throw new Error(`VATSIM feed HTTP ${res.status}`);
        const feed = (await res.json()) as VatsimFeed;
        this.store.ingest(feed);
        this.lastFetch = Date.now();
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Waits for fresh data only when what we have is missing or clearly stale. */
  async ensureFresh(): Promise<void> {
    const age = Date.now() - this.lastFetch;
    if (this.store.updated === 0 || age > REFRESH_MS * 3) return this.refresh();
    if (age > REFRESH_MS) this.refresh().catch(() => {});
  }

  private cached(key: string, build: () => unknown): string {
    const hit = this.cache.get(key);
    if (hit && hit.version === this.store.version) return hit.body;
    const body = JSON.stringify(build());
    this.cache.set(key, { version: this.store.version, body });
    if (this.cache.size > 500) this.cache.clear();
    return body;
  }

  async flights(): Promise<string> {
    await this.ensureFresh();
    return this.cached("flights", () => flightRows(this.store));
  }

  async flight(callsign: string): Promise<string | null> {
    await this.ensureFresh();
    const body = this.cached(`f:${callsign}`, () => flightDetail(this.store, callsign));
    return body === "null" ? null : body;
  }

  async airport(code: string): Promise<string | null> {
    await this.ensureFresh();
    const body = this.cached(`a:${code}`, () => airportDetail(this.store, code));
    return body === "null" ? null : body;
  }

  async airports(): Promise<string> {
    await this.ensureFresh();
    return this.cached("airports", () => airportRows(this.store));
  }

  async search(q: string): Promise<string> {
    await this.ensureFresh();
    return JSON.stringify(search(this.store, q));
  }
}
