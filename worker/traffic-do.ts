import { DurableObject } from "cloudflare:workers";
import { REFRESH_MS, TrafficService } from "../src/lib/traffic-service";
import type { StoreSnapshot } from "../src/lib/traffic-store";

const SNAPSHOT_EVERY_MS = 5 * 60_000;
const CHUNK = 1_000_000;

/**
 * Single global object that polls VATSIM every 15 s and keeps every flight's
 * trail in memory. A gzipped snapshot is written every few minutes so trails
 * survive deploys and evictions.
 */
export class TrafficTracker extends DurableObject {
  private service = new TrafficService();
  private lastSnapshot = Date.now();
  private ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
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
