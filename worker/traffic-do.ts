import { DurableObject } from "cloudflare:workers";
import { HISTORY_DAYS, type HistoryStore } from "../src/lib/history";
import { REFRESH_MS, TrafficService } from "../src/lib/traffic-service";
import type { StoreSnapshot } from "../src/lib/traffic-store";

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const CHUNK = 1_000_000;

async function gzip(text: string): Promise<ArrayBuffer> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

async function gunzip(data: ArrayBuffer): Promise<string> {
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

/** Playback frames in the object's SQLite storage, gzipped, kept HISTORY_DAYS. */
class SqlHistory implements HistoryStore {
  private writes = 0;
  constructor(private sql: SqlStorage) {
    sql.exec("CREATE TABLE IF NOT EXISTS frames (t INTEGER PRIMARY KEY, data BLOB NOT NULL)");
  }
  async put(t: number, rows: string) {
    this.sql.exec("INSERT OR REPLACE INTO frames (t, data) VALUES (?, ?)", t, await gzip(rows));
    if (this.writes++ % 60 === 0) this.sql.exec("DELETE FROM frames WHERE t < ?", t - HISTORY_DAYS * 86400);
  }
  async read(from: number, to: number) {
    const rows = this.sql.exec<{ t: number; data: ArrayBuffer }>("SELECT t, data FROM frames WHERE t >= ? AND t < ? ORDER BY t", from, to).toArray();
    return Promise.all(rows.map(async (r) => [r.t, await gunzip(r.data)] as [number, string]));
  }
  async bounds() {
    const r = this.sql.exec<{ first: number | null; last: number | null }>("SELECT MIN(t) AS first, MAX(t) AS last FROM frames").one();
    return r.first === null || r.last === null ? null : { first: r.first, last: r.last };
  }
}

/**
 * Single global object that polls VATSIM every 15 s and keeps every flight's
 * trail in memory. A gzipped snapshot is written every few minutes so trails
 * survive deploys and evictions.
 */
export class TrafficTracker extends DurableObject {
  private service: TrafficService;
  private lastSnapshot = Date.now();
  private ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.service = new TrafficService(new SqlHistory(ctx.storage.sql));
    this.ready = ctx.blockConcurrencyWhile(async () => {
      await this.restore().catch((e) => console.error("restore failed", e));
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now() + 1000);
    });
  }

  async alarm() {
    await this.ready;
    try {
      await this.service.refresh();
    } catch (e) {
      console.error("refresh failed", e);
    }
    await this.ctx.storage.setAlarm(Date.now() + REFRESH_MS);
    if (Date.now() - this.lastSnapshot > SNAPSHOT_EVERY_MS) {
      this.lastSnapshot = Date.now();
      await this.persist().catch((e) => console.error("snapshot failed", e));
    }
  }

  async flights() { await this.ready; return this.service.flights(); }
  async flight(callsign: string) { await this.ready; return this.service.flight(callsign); }
  async airport(code: string) { await this.ready; return this.service.airport(code); }
  async airports() { await this.ready; return this.service.airports(); }
  async search(q: string) { await this.ready; return this.service.search(q); }
  async playbackRange() { await this.ready; return this.service.playbackRange(); }
  async playback(from: number, minutes: number) { await this.ready; return this.service.playback(from, minutes); }

  private async persist() {
    const json = JSON.stringify(this.service.store.snapshot());
    const gz = new Uint8Array(
      await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
    );
    const entries: Record<string, Uint8Array | number> = { "snap:n": Math.ceil(gz.length / CHUNK) };
    for (let i = 0; i * CHUNK < gz.length; i++) entries[`snap:${i}`] = gz.subarray(i * CHUNK, (i + 1) * CHUNK);
    await this.ctx.storage.put(entries);
  }

  private async restore() {
    const n = await this.ctx.storage.get<number>("snap:n");
    if (!n) return;
    const keys = Array.from({ length: n }, (_, i) => `snap:${i}`);
    const parts = await this.ctx.storage.get<Uint8Array>(keys);
    const chunks = keys.map((k) => parts.get(k));
    if (chunks.some((c) => !c)) return;
    const stream = new Blob(chunks as BlobPart[]).stream().pipeThrough(new DecompressionStream("gzip"));
    const snap = (await new Response(stream).json()) as StoreSnapshot;
    this.service.store.restore(snap);
  }
}
