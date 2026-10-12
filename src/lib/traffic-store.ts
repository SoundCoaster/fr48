import { angleDiff, distanceNm } from "./geo";
import type { VatsimController, VatsimFeed, VatsimFlightPlan, VatsimPrefile } from "./types";

/** Flat trail layout: lat, lon, altitude, groundspeed, heading, unix seconds. */
export const TRAIL_STRIDE = 6;
const MAX_TRAIL_POINTS = 3000;
/** How long a disconnected flight is kept so a reconnect can resume its track. */
const RESUME_WINDOW_S = 30 * 60;
const GROUND_SPEED_KT = 50;

export interface Track {
  key: string;
  callsign: string;
  cid: number;
  name: string;
  server: string;
  rating: number;
  lat: number;
  lon: number;
  alt: number;
  gs: number;
  hdg: number;
  sq: string;
  qnh: number;
  fp: VatsimFlightPlan | null;
  logon: string;
  lastUpdated: string;
  firstSeen: number;
  lastSeen: number;
  online: boolean;
  onGround: boolean;
  everAirborne: boolean;
  takeoffAt: number | null;
  landedAt: number | null;
  /** Smoothed vertical speed, ft/min */
  vs: number;
  prevAlt: number;
  prevT: number;
  trail: number[];
}

export interface StoreSnapshot {
  v: 1;
  updated: number;
  tracks: Track[];
}

export class TrafficStore {
  tracks = new Map<string, Track>();
  /** Online flights by callsign (callsigns are unique while connected). */
  byCallsign = new Map<string, Track>();
  prefiles: VatsimPrefile[] = [];
  controllers: VatsimController[] = [];
  atis: VatsimController[] = [];
  pilotRatings = new Map<number, string>();
  ratings = new Map<number, string>();
  facilities = new Map<number, string>();
  stats = { pilots: 0, controllers: 0, users: 0 };
  /** Feed timestamp (ms) of the last ingested update. */
  updated = 0;
  /** Bumped on every ingest; lets callers cache derived payloads. */
  version = 0;
  /** Trails rebuilt from recorded history at startup, applied when a callsign is first seen. */
  private seeds = new Map<string, { trail: number[]; takeoffAt: number | null }>();

  /**
   * Rebuild recent trails from one-minute history frames ([t, rows] oldest first,
   * rows = [callsign, lat, lon, hdg, alt, gs, …]) so a restart doesn't lose them.
   * Each callsign keeps its current leg: from just before its last take-off.
   */
  seedTrails(frames: [number, [string, number, number, number, number, number, ...unknown[]][]][]) {
    const byCs = new Map<string, number[][]>();
    for (const [t, rows] of frames) {
      for (const [cs, lat, lon, hdg, alt, gs] of rows) {
        let pts = byCs.get(cs);
        if (!pts) byCs.set(cs, (pts = []));
        const prev = pts[pts.length - 1];
        // A gap of more than 20 minutes means another flight: start over
        if (prev && t - prev[5] > 1200) pts.length = 0;
        pts.push([lat, lon, alt, gs, hdg, t]);
      }
    }
    this.seeds.clear();
    for (const [cs, pts] of byCs) {
      let start = 0;
      let takeoffAt: number | null = null;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1][3] < GROUND_SPEED_KT && pts[i][3] >= GROUND_SPEED_KT) {
          start = Math.max(0, i - 2); // keep a little taxi before the take-off
          takeoffAt = pts[i][5];
        }
      }
      const leg = pts.slice(start);
      if (leg.length >= 2) this.seeds.set(cs, { trail: leg.flat(), takeoffAt });
    }
  }

  private applySeed(tr: Track) {
    const seed = this.seeds.get(tr.callsign);
    if (!seed) return;
    this.seeds.delete(tr.callsign);
    tr.trail = seed.trail.concat(tr.trail);
    if (seed.takeoffAt !== null) {
      tr.takeoffAt = seed.takeoffAt;
      tr.everAirborne = true;
    }
    tr.firstSeen = seed.trail[5];
  }


  ingest(feed: VatsimFeed): boolean {
    const updated = Date.parse(feed.general.update_timestamp);
    if (updated <= this.updated) return false;
    this.updated = updated;
    this.version++;
    const t = Math.round(updated / 1000);

    this.prefiles = feed.prefiles;
    this.controllers = feed.controllers;
    this.atis = feed.atis;
    this.stats = {
      pilots: feed.pilots.length,
      controllers: feed.controllers.length + feed.atis.length,
      users: feed.general.unique_users,
    };
    for (const r of feed.pilot_ratings) this.pilotRatings.set(r.id, r.long_name);
    for (const r of feed.ratings) this.ratings.set(r.id, r.long);
    for (const f of feed.facilities) this.facilities.set(f.id, f.long);

    const seen = new Set<string>();
    this.byCallsign.clear();

    for (const p of feed.pilots) {
      if (p.latitude === 0 && p.longitude === 0) continue;
      const key = `${p.callsign}|${p.cid}`;
      seen.add(key);
      let tr = this.tracks.get(key);
      const onGround = p.groundspeed < GROUND_SPEED_KT;

      if (!tr) {
        tr = {
          key,
          callsign: p.callsign,
          cid: p.cid,
          name: p.name,
          server: p.server,
          rating: p.pilot_rating,
          lat: p.latitude,
          lon: p.longitude,
          alt: p.altitude,
          gs: p.groundspeed,
          hdg: p.heading,
          sq: p.transponder,
          qnh: p.qnh_mb,
          fp: p.flight_plan,
          logon: p.logon_time,
          lastUpdated: p.last_updated,
          firstSeen: t,
          lastSeen: t,
          online: true,
          onGround,
          everAirborne: !onGround,
          takeoffAt: null,
          landedAt: null,
          vs: 0,
          prevAlt: p.altitude,
          prevT: t,
          trail: [],
        };
        this.tracks.set(key, tr);
        this.applySeed(tr);
      } else {
        // New leg: a different route filed, or a fresh take-off after a landing.
        const fpChanged =
          tr.fp && p.flight_plan &&
          (tr.fp.departure !== p.flight_plan.departure || tr.fp.arrival !== p.flight_plan.arrival);
        // A new route only starts a new leg on the ground; amending the plan in flight
        // (new destination, diversion) must not wipe the trail
        if (fpChanged && onGround && tr.onGround) this.resetLeg(tr, t);

        const dt = t - tr.prevT;
        if (dt > 0 && dt < 300) {
          const instant = ((p.altitude - tr.prevAlt) / dt) * 60;
          tr.vs = Math.round(tr.vs * 0.4 + instant * 0.6);
        } else tr.vs = 0;
        tr.prevAlt = p.altitude;
        tr.prevT = t;

        if (tr.onGround && !onGround) {
          // A quick touch-and-go stays on the same leg; a turnaround starts a new one.
          if (tr.landedAt !== null && t - tr.landedAt > 300) this.resetLeg(tr, t);
          if (tr.takeoffAt === null) tr.takeoffAt = t;
          tr.landedAt = null;
          tr.everAirborne = true;
        } else if (!tr.onGround && onGround && tr.everAirborne) {
          tr.landedAt = t;
        }

        Object.assign(tr, {
          name: p.name,
          server: p.server,
          rating: p.pilot_rating,
          lat: p.latitude,
          lon: p.longitude,
          alt: p.altitude,
          gs: p.groundspeed,
          hdg: p.heading,
          sq: p.transponder,
          qnh: p.qnh_mb,
          fp: p.flight_plan ?? tr.fp,
          logon: p.logon_time,
          lastUpdated: p.last_updated,
          lastSeen: t,
          online: true,
          onGround,
        });
      }
      if (onGround) tr.vs = 0;
      this.appendTrail(tr, t);
      this.byCallsign.set(tr.callsign, tr);
    }

    for (const [key, tr] of this.tracks) {
      if (seen.has(key)) continue;
      tr.online = false;
      if (t - tr.lastSeen > RESUME_WINDOW_S) this.tracks.delete(key);
    }
    return true;
  }

  private resetLeg(tr: Track, t: number) {
    tr.trail = [];
    tr.takeoffAt = null;
    tr.landedAt = null;
    tr.everAirborne = false;
    tr.firstSeen = t;
  }

  private appendTrail(tr: Track, t: number) {
    const s = tr.trail;
    const n = s.length;
    if (n >= TRAIL_STRIDE) {
      const [lat, lon, alt, gs, hdg, lt] = s.slice(n - TRAIL_STRIDE);
      const dt = t - lt;
      if (dt < 10) return;
      const moved = distanceNm(lat, lon, tr.lat, tr.lon);
      if (tr.onGround) {
        // Taxi: keep points only when actually moving
        if (moved < 0.03) return;
      } else {
        const significant =
          angleDiff(hdg, tr.hdg) > 3 || Math.abs(alt - tr.alt) > 300 || Math.abs(gs - tr.gs) > 20;
        if (dt < 60 && !significant) return;
      }
    }
    s.push(round(tr.lat, 5), round(tr.lon, 5), tr.alt, tr.gs, tr.hdg, t);
    if (s.length > MAX_TRAIL_POINTS * TRAIL_STRIDE) s.splice(0, TRAIL_STRIDE * 100);
  }

  snapshot(): StoreSnapshot {
    return { v: 1, updated: this.updated, tracks: [...this.tracks.values()] };
  }

  restore(snap: StoreSnapshot) {
    if (snap?.v !== 1) return;
    this.updated = 0; // force next ingest
    this.tracks = new Map(snap.tracks.map((t) => [t.key, { ...t, online: false }]));
  }
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
