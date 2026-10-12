import { airportDetail, airportRows, flightDetail, flightRows, search } from "./derive";
import { frameRows, MemoryHistory, type HistoryStore } from "./history";
import { TrafficStore } from "./traffic-store";
import type { VatsimFeed } from "./types";

import { REFRESH_MS, USER_AGENT, VATSIM_FEED } from "./constants";

export { REFRESH_MS };

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
  /** callsign -> timestamps (ms) of recent detail requests, to estimate live viewers. */
  private views = new Map<string, number[]>();
  /** Minute (unix s) of the last playback frame recorded. */
  private lastFrame = 0;

  constructor(private archive: HistoryStore = new MemoryHistory()) {}

  /** Record one playback frame per minute of feed time. */
  private async recordFrame() {
    const t = Math.floor(this.store.updated / 60_000) * 60;
    if (!t || t === this.lastFrame) return;
    this.lastFrame = t;
    await this.archive.put(t, frameRows(this.store));
  }

  /** Each open flight panel polls every 15 s, so requests in the last 15 s ≈ viewers. */
  private viewers(): Map<string, number> {
    const cutoff = Date.now() - 16_000;
    const out = new Map<string, number>();
    for (const [cs, ts] of this.views) {
      const recent = ts.filter((t) => t > cutoff);
      if (recent.length) {
        this.views.set(cs, recent);
        out.set(cs, recent.length);
      } else this.views.delete(cs);
    }
    return out;
  }

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const res = await fetch(VATSIM_FEED, { headers: { "user-agent": USER_AGENT } });
        if (!res.ok) throw new Error(`VATSIM feed HTTP ${res.status}`);
        const feed = (await res.json()) as VatsimFeed;
        this.store.ingest(feed);
        this.lastFetch = Date.now();
        await this.recordFrame().catch((e) => console.error("history write failed", e));
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
    return this.cached("flights", () => flightRows(this.store, this.viewers()));
  }

  async flight(callsign: string): Promise<string | null> {
    await this.ensureFresh();
    const ts = this.views.get(callsign) ?? [];
    ts.push(Date.now());
    this.views.set(callsign, ts.slice(-500));
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

  async playbackRange(): Promise<string> {
    return JSON.stringify(await this.archive.bounds());
  }

  /** Frames for [from, from + minutes), as {"frames":[[t, rows], ...]} without re-parsing rows. */
  async playback(from: number, minutes: number): Promise<string> {
    const frames = await this.archive.read(from, from + minutes * 60);
    return `{"frames":[${frames.map(([t, rows]) => `[${t},${rows}]`).join(",")}]}`;
  }

  async search(q: string): Promise<string> {
    await this.ensureFresh();
    return JSON.stringify(search(this.store, q));
  }
}
