import { aircraftInfo } from "@/data/aircraft";
import type { TrafficStore } from "./traffic-store";
import type { FlightLog } from "./types";

/** How long playback history is kept. */
export const HISTORY_DAYS = 7;
/** How long flight history (one record per leg) is kept. */
export const FLIGHT_LOG_DAYS = 90;

export interface LegQuery {
  callsign?: string;
  /** Registration without dashes, upper case */
  reg?: string;
}

/**
 * One playback frame row:
 * [callsign, lat, lon, heading, altitude ft, groundspeed kt, type, origin, destination, silhouette]
 */
export type HistoryRow = [string, number, number, number, number, number, string, string, string, string];

/** Storage for one-per-minute traffic frames (rows serialised as JSON). */
export interface HistoryStore {
  put(t: number, rowsJson: string): Promise<void>;
  read(from: number, to: number): Promise<[number, string][]>;
  bounds(): Promise<{ first: number; last: number } | null>;
  putLegs(logs: FlightLog[]): Promise<void>;
  /** Most recent first. */
  legs(q: LegQuery, limit: number): Promise<FlightLog[]>;
}

/** In-process history for `next dev` (last few hours only). */
export class MemoryHistory implements HistoryStore {
  private frames = new Map<number, string>();
  constructor(private max = 360) {}
  async put(t: number, rows: string) {
    this.frames.set(t, rows);
    while (this.frames.size > this.max) this.frames.delete(this.frames.keys().next().value!);
  }
  async read(from: number, to: number) {
    return [...this.frames].filter(([t]) => t >= from && t < to).sort((a, b) => a[0] - b[0]);
  }
  async bounds() {
    const ts = [...this.frames.keys()];
    return ts.length ? { first: Math.min(...ts), last: Math.max(...ts) } : null;
  }
  private logs: FlightLog[] = [];
  async putLegs(logs: FlightLog[]) {
    this.logs.push(...logs);
    if (this.logs.length > 5000) this.logs.splice(0, this.logs.length - 5000);
  }
  async legs(q: LegQuery, limit: number) {
    return this.logs
      .filter((l) => (q.callsign && l.callsign === q.callsign) || (q.reg && l.reg && l.reg.replace(/-/g, "") === q.reg))
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function frameRows(store: TrafficStore): string {
  const rows: HistoryRow[] = [];
  for (const tr of store.byCallsign.values()) {
    const type = tr.fp?.aircraft_short || "";
    rows.push([
      tr.callsign,
      r4(tr.lat),
      r4(tr.lon),
      Math.round(tr.hdg),
      Math.round(tr.alt),
      Math.round(tr.gs),
      type,
      tr.fp?.departure || "",
      tr.fp?.arrival || "",
      aircraftInfo(type).silhouette,
    ]);
  }
  return JSON.stringify(rows);
}
