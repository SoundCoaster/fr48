import { DurableObject } from "cloudflare:workers";
import { HISTORY_DAYS, type HistoryStore } from "../src/lib/history";
import { REFRESH_MS, TrafficService } from "../src/lib/traffic-service";


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
    // The flight-history table is gone (too many storage reads on the free plan)
    sql.exec("DROP TABLE IF EXISTS flights");
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
    // Two indexed lookups: SQLite only uses the primary key for a lone MIN() or MAX(),
    // a combined MIN(t), MAX(t) scans every row.
    const first = this.sql.exec<{ t: number }>("SELECT t FROM frames ORDER BY t ASC LIMIT 1").toArray()[0]?.t;
    const last = this.sql.exec<{ t: number }>("SELECT t FROM frames ORDER BY t DESC LIMIT 1").toArray()[0]?.t;
    return first === undefined || last === undefined ? null : { first, last };
  }
}

/**
 * Single global object that polls VATSIM every 15 s and keeps every flight's
 * trail in memory. Storage stays within the Durable Objects free tier: one
 * alarm row write per 15 s and one playback frame per minute (~8k rows/day).
 * On restart, trails are rebuilt from the playback frames (no big snapshots).
 */
export class TrafficTracker extends DurableObject {
  private service: TrafficService;
  private alarmSet = false;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.service = new TrafficService(new SqlHistory(ctx.storage.sql));
  }

  /** Called on every request: make sure polling is running (e.g. after an eviction). */
  private async touch() {
    if (!this.alarmSet) {
      this.alarmSet = true;
      await this.ctx.storage.setAlarm(Date.now() + REFRESH_MS);
    }
  }

  async alarm() {
    try {
      await this.service.refresh();
    } catch (e) {
      console.error("refresh failed", e);
    }
    this.alarmSet = true;
    await this.ctx.storage.setAlarm(Date.now() + REFRESH_MS);
  }

  async flights() { await this.touch(); return this.service.flights(); }
  async flight(callsign: string) { await this.touch(); return this.service.flight(callsign); }
  async airport(code: string) { await this.touch(); return this.service.airport(code); }
  async airports() { await this.touch(); return this.service.airports(); }
  async search(q: string) { await this.touch(); return this.service.search(q); }
  async playbackRange() { await this.touch(); return this.service.playbackRange(); }
  async atc() { await this.touch(); return this.service.atc(); }
  async playback(from: number, minutes: number) { await this.touch(); return this.service.playback(from, minutes); }
}
