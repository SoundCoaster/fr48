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

/** A finished flight leg, collected for the flight history. */
export interface CompletedLeg {
  callsign: string;
  cid: number;
  pilot: string;
  fp: VatsimFlightPlan | null;
  firstSeen: number;
  lastSeen: number;
  takeoffAt: number | null;
  landedAt: number | null;
  distanceNm: number;
  maxAlt: number;
}

/** Summary of a track's current leg (also used for live entries in the history). */
export function legOf(tr: Track): CompletedLeg {
  let dist = 0;
  let maxAlt = 0;
  const s = tr.trail;
  for (let i = 0; i < s.length; i += TRAIL_STRIDE) {
    if (s[i + 2] > maxAlt) maxAlt = s[i + 2];
    if (i >= TRAIL_STRIDE) dist += distanceNm(s[i - TRAIL_STRIDE], s[i - TRAIL_STRIDE + 1], s[i], s[i + 1]);
  }
  return {
    callsign: tr.callsign,
    cid: tr.cid,
    pilot: tr.name,
    fp: tr.fp,
    firstSeen: tr.firstSeen,
    lastSeen: tr.lastSeen,
    takeoffAt: tr.takeoffAt,
    landedAt: tr.landedAt,
    distanceNm: Math.round(dist),
    maxAlt: Math.max(maxAlt, tr.alt),
  };
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
  /** Legs that ended since the last drain (new leg started, or track dropped). */
  completed: CompletedLeg[] = [];

  /** Only legs that actually flew are worth keeping in the history. */
  private complete(tr: Track) {
    if (tr.everAirborne || tr.takeoffAt !== null) this.completed.push(legOf(tr));
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
      } else {
        // New leg: a different route filed, or a fresh take-off after a landing.
        const fpChanged =
          tr.fp && p.flight_plan &&
          (tr.fp.departure !== p.flight_plan.departure || tr.fp.arrival !== p.flight_plan.arrival);
        if (fpChanged) this.resetLeg(tr, t);

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
      if (t - tr.lastSeen > RESUME_WINDOW_S) {
        this.complete(tr);
        this.tracks.delete(key);
      }
    }
    return true;
  }

  private resetLeg(tr: Track, t: number) {
    this.complete(tr);
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
