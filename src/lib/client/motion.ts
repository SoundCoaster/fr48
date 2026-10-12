"use client";

import type { FlightsResponse } from "../types";

/**
 * Smooth aircraft motion from 15-second VATSIM snapshots.
 *
 * Positions are shown DELAY_S seconds behind the newest data so there is
 * almost always a known sample on both sides of the render time; the aircraft
 * then moves along a cubic Hermite curve whose tangents are each sample's
 * heading and groundspeed. Turns follow the real path instead of
 * dead-reckoning straight ahead and sliding sideways when the next update
 * lands.
 */
// Feed every 15 s + server refresh (<=15 s) + client poll (15 s, see useLiveFlights)
export const DELAY_S = 30;
const KEEP = 5;
const MAX_EXTRAPOLATE_S = 60;

interface Sample {
  t: number; // feed time, unix s
  lat: number;
  lon: number; // unwrapped relative to the previous sample
  hdg: number;
  gs: number;
  alt: number;
}

export interface Motion {
  lat: number;
  lon: number;
  hdg: number;
  alt: number;
  gs: number;
}

const tracks = new Map<string, Sample[]>();
let lastFeed = 0;
/** server clock - client clock (ms) */
let clockOffset = 0;

/** Record a new feed snapshot. */
export function ingestFlights(data: FlightsResponse, receivedAt: number) {
  const t = Date.parse(data.updated) / 1000;
  if (!(t > lastFeed)) return;
  lastFeed = t;
  clockOffset = data.serverTime - receivedAt;
  const seen = new Set<string>();
  for (const [cs, lat, lon, hdg, alt, gs] of data.flights) {
    seen.add(cs);
    const list = tracks.get(cs) ?? [];
    const prev = list[list.length - 1];
    let l = lon;
    if (prev) {
      while (l - prev.lon > 180) l -= 360;
      while (l - prev.lon < -180) l += 360;
    }
    list.push({ t, lat, lon: l, hdg, gs, alt });
    if (list.length > KEEP) list.shift();
    tracks.set(cs, list);
  }
  for (const [cs, list] of tracks) if (!seen.has(cs) && t - list[list.length - 1].t > 45) tracks.delete(cs);
}

/** The time (server clock, unix s) aircraft are currently drawn at. */
export function renderTime(): number {
  return (Date.now() + clockOffset) / 1000 - DELAY_S;
}

const RAD = Math.PI / 180;
const norm = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Straight-line dead reckoning from one sample (used before the first / after the last). */
function extrapolate(s: Sample, dt: number): Motion {
  if (s.gs < 5) return { lat: s.lat, lon: norm(s.lon), hdg: s.hdg, alt: s.alt, gs: s.gs };
  const d = (s.gs / 3600) * Math.max(-MAX_EXTRAPOLATE_S, Math.min(MAX_EXTRAPOLATE_S, dt)); // nm
  const lat = s.lat + (Math.cos(s.hdg * RAD) * d) / 60;
  const lon = s.lon + (Math.sin(s.hdg * RAD) * d) / (60 * Math.max(0.05, Math.cos(s.lat * RAD)));
  return { lat, lon: norm(lon), hdg: s.hdg, alt: s.alt, gs: s.gs };
}

function between(a: Sample, b: Sample, tr: number): Motion {
  const T = b.t - a.t;
  const s = Math.max(0, Math.min(1, (tr - a.t) / T));
  const alt = a.alt + (b.alt - a.alt) * s;
  const gs = a.gs + (b.gs - a.gs) * s;
  // Local plane in nautical miles around `a`
  const k = 60 * Math.max(0.05, Math.cos(a.lat * RAD));
  const x1 = (b.lon - a.lon) * k;
  const y1 = (b.lat - a.lat) * 60;
  const dist = Math.hypot(x1, y1);
  const expected = (Math.max(a.gs, b.gs) / 3600) * T;
  // Slow (taxi), teleport or inconsistent data: plain linear interpolation
  if (a.gs < 30 || b.gs < 30 || dist > expected * 2.5 + 0.5) {
    const hdg = dist > 0.01 ? (Math.atan2(x1, y1) / RAD + 360) % 360 : b.hdg;
    return { lat: a.lat + (b.lat - a.lat) * s, lon: norm(a.lon + (b.lon - a.lon) * s), hdg: a.gs < 5 && b.gs < 5 ? b.hdg : hdg, alt, gs };
  }
  // Tangents: velocity vectors (nm/s) scaled by the segment duration
  const mx0 = Math.sin(a.hdg * RAD) * (a.gs / 3600) * T;
  const my0 = Math.cos(a.hdg * RAD) * (a.gs / 3600) * T;
  const mx1 = Math.sin(b.hdg * RAD) * (b.gs / 3600) * T;
  const my1 = Math.cos(b.hdg * RAD) * (b.gs / 3600) * T;
  const s2 = s * s, s3 = s2 * s;
  const h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const x = h10 * mx0 + h01 * x1 + h11 * mx1;
  const y = h10 * my0 + h01 * y1 + h11 * my1;
  // Derivative gives the direction of travel -> smooth heading through the turn
  const d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  const vx = d10 * mx0 + d01 * x1 + d11 * mx1;
  const vy = d10 * my0 + d01 * y1 + d11 * my1;
  const hdg = Math.hypot(vx, vy) > 1e-6 ? (Math.atan2(vx, vy) / RAD + 360) % 360 : b.hdg;
  return { lat: a.lat + y / 60, lon: norm(a.lon + x / k), hdg, alt, gs };
}

/** Where aircraft `cs` is at render time `tr`, or null if unknown. */
export function motionAt(cs: string, tr: number): Motion | null {
  const list = tracks.get(cs);
  if (!list?.length) return null;
  if (tr <= list[0].t) return extrapolate(list[0], tr - list[0].t);
  for (let i = list.length - 1; i > 0; i--) {
    if (tr >= list[i - 1].t && tr <= list[i].t) return between(list[i - 1], list[i], tr);
  }
  const last = list[list.length - 1];
  return extrapolate(last, tr - last.t);
}
