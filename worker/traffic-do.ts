import { DurableObject } from "cloudflare:workers";
import { FLIGHT_LOG_DAYS, HISTORY_DAYS, type HistoryStore, type LegQuery } from "../src/lib/history";
import type { FlightLog } from "../src/lib/types";
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
    sql.exec(`CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      callsign TEXT NOT NULL, reg TEXT, cid INTEGER, pilot TEXT,
      dep TEXT, arr TEXT, type TEXT,
      std INTEGER, sta INTEGER, atd INTEGER, ata INTEGER,
      first_seen INTEGER, last_seen INTEGER, dist INTEGER, max_alt INTEGER
    )`);
    sql.exec("CREATE INDEX IF NOT EXISTS flights_callsign ON flights (callsign, last_seen)");
    sql.exec("CREATE INDEX IF NOT EXISTS flights_reg ON flights (reg, last_seen)");
  }
  private legWrites = 0;
  async putLegs(logs: FlightLog[]) {
    for (const l of logs) {
      this.sql.exec(
        "INSERT INTO flights (callsign, reg, cid, pilot, dep, arr, type, std, sta, atd, ata, first_seen, last_seen, dist, max_alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        l.callsign, l.reg ? l.reg.replace(/-/g, "") : null, l.cid, l.pilot, l.dep, l.arr, l.type,
        l.std, l.sta, l.atd, l.ata, l.firstSeen, l.lastSeen, l.distanceNm, l.maxAlt,
      );
    }
    if (this.legWrites++ % 200 === 0) this.sql.exec("DELETE FROM flights WHERE last_seen < ?", Date.now() / 1000 - FLIGHT_LOG_DAYS * 86400);
  }
  async legs(q: LegQuery, limit: number): Promise<FlightLog[]> {
    const where = q.callsign ? "callsign = ?" : "reg = ?";
    const rows = this.sql
      .exec<Record<string, string | number | null>>(`SELECT * FROM flights WHERE ${where} ORDER BY last_seen DESC LIMIT ?`, q.callsign ?? q.reg ?? "", limit)
      .toArray();
    return rows.map((r) => ({
      callsign: r.callsign as string,
      reg: (r.reg as string | null) ?? null,
      cid: r.cid as number,
      pilot: (r.pilot as string) ?? "",
      dep: (r.dep as string) ?? "",
      arr: (r.arr as string) ?? "",
      type: (r.type as string) ?? "",
      std: r.std as number | null,
      sta: r.sta as number | null,
      atd: r.atd as number | null,
      ata: r.ata as number | null,
      firstSeen: r.first_seen as number,
      lastSeen: r.last_seen as number,
      distanceNm: (r.dist as number) ?? 0,
      maxAlt: (r.max_alt as number) ?? 0,
    }));
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
  async history(query: { callsign?: string; reg?: string }) { await this.ready; return this.service.history(query); }

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
