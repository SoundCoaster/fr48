"use client";

import type { Silhouette } from "@/data/aircraft";
import type { HistoryRow } from "../history";
import type { FlightRow } from "../types";
import { setState } from "./store";

const CHUNK_S = 600; // frames are fetched 10 minutes at a time

/** minute (unix s) -> callsign -> row */
const frames = new Map<number, Map<string, HistoryRow>>();
const chunks = new Map<number, Promise<void>>();

function loadChunk(start: number): Promise<void> {
  let p = chunks.get(start);
  if (!p) {
    p = fetch(`/api/playback?from=${start}&minutes=${CHUNK_S / 60}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ frames: [number, HistoryRow[]][] }>) : { frames: [] }))
      .then((d) => {
        for (const [t, rows] of d.frames) frames.set(t, new Map(rows.map((r) => [r[0], r])));
        // Wake the map so newly loaded frames are drawn
        setState({});
      })
      .catch(() => {
        // Retry later, not on every tick (each request reads storage rows server-side)
        setTimeout(() => chunks.delete(start), 30_000);
      });
    chunks.set(start, p);
  }
  return p;
}

/** Make sure frames around `t` (and a little history for trails) are loading. */
export function ensureFrames(t: number) {
  const start = Math.floor(t / CHUNK_S) * CHUNK_S;
  for (const s of [start - CHUNK_S, start, start + CHUNK_S]) loadChunk(s);
}

const unwrap = (ref: number, lon: number) => (lon - ref > 180 ? lon - 360 : lon - ref < -180 ? lon + 360 : lon);
const lerpAngle = (a: number, b: number, k: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
};

let lastSample: FlightRow[] = [];

/** Traffic at time `t`, interpolated between the surrounding one-minute frames. */
export function sampleAt(t: number): FlightRow[] {
  const m0 = Math.floor(t / 60) * 60;
  const f0 = frames.get(m0);
  if (!f0) return lastSample;
  const f1 = frames.get(m0 + 60);
  const k = (t - m0) / 60;
  const out: FlightRow[] = [];
  for (const [cs, a] of f0) {
    const b = f1?.get(cs);
    let lat = a[1], lon = a[2], hdg = a[3], alt = a[4], gs = a[5];
    if (b) {
      lat += (b[1] - a[1]) * k;
      lon += (unwrap(a[2], b[2]) - a[2]) * k;
      hdg = lerpAngle(a[3], b[3], k);
      alt += (b[4] - a[4]) * k;
      gs += (b[5] - a[5]) * k;
    }
    out.push([cs, lat, ((lon + 540) % 360) - 180, hdg, alt, gs, a[6], a[7], a[8], "", 0, gs < 50 ? 1 : 0, a[9] as Silhouette, ""]);
  }
  lastSample = out;
  return out;
}

/** Positions of one flight in the loaded frames up to `t`: [lon, lat, altitude][] (oldest first). */
export function trailAt(cs: string, t: number, maxMinutes = 60): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const end = Math.floor(t / 60) * 60;
  for (let m = end - maxMinutes * 60; m <= end; m += 60) {
    const r = frames.get(m)?.get(cs);
    if (r) pts.push([r[2], r[1], r[4]]);
  }
  return pts;
}

export function frameLoaded(t: number): boolean {
  return frames.has(Math.floor(t / 60) * 60);
}

export async function fetchRange(): Promise<{ first: number; last: number } | null> {
  try {
    const r = await fetch("/api/playback?range=1", { cache: "no-store" });
    return r.ok ? ((await r.json()) as { first: number; last: number } | null) : null;
  } catch {
    return null;
  }
}
