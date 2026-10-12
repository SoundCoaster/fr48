import firsJson from "@/data/firs.json";
import traconsJson from "@/data/tracons.json";
import { airport } from "./refdata";
import type { TrafficStore } from "./traffic-store";
import type { AtcResponse, AtcStation, VatsimController } from "./types";

const firs = firsJson.firs as [icao: string, name: string, prefix: string, boundary: string][];
const uirs = firsJson.uirs as [icao: string, name: string, firs: string[]][];
const tracons = traconsJson as [id: string, prefixes: string[], name: string][];

const byPrefix = new Map<string, string>(); // callsign prefix -> boundary id
const byIcao = new Map<string, string>(); // FIR ICAO -> boundary id
for (const [icao, , prefix, boundary] of firs) {
  if (prefix && !byPrefix.has(prefix)) byPrefix.set(prefix, boundary);
  if (!byIcao.has(icao)) byIcao.set(icao, boundary);
}
const uirByIcao = new Map(uirs.map(([icao, , list]) => [icao, list]));
const traconByPrefix = new Map<string, string>();
for (const [id, prefixes] of tracons) for (const p of prefixes) if (!traconByPrefix.has(p)) traconByPrefix.set(p, id);

function firBoundaries(parts: string[]): string[] | null {
  // Most specific first: "EDGG_N" before "EDGG"
  for (const p of [parts.slice(0, -1).join("_"), parts.slice(0, 2).join("_"), parts[0]]) {
    const b = byPrefix.get(p) ?? byIcao.get(p);
    if (b) return [b];
    const uir = uirByIcao.get(p);
    if (uir) return uir.map((icao) => byIcao.get(icao) ?? icao);
  }
  return null;
}

function airportFor(prefix: string) {
  const a = airport(prefix) ?? (prefix.length === 3 ? airport(`K${prefix}`) : null);
  return a ? { icao: a.icao, iata: a.iata, name: a.name, lat: a.lat, lon: a.lon } : undefined;
}

function resolve(c: VatsimController, store: TrafficStore): AtcStation {
  const parts = c.callsign.toUpperCase().split("_");
  const facility = parts[parts.length - 1];
  const base: AtcStation = {
    callsign: c.callsign,
    name: c.name,
    frequency: c.frequency,
    facility,
    rating: store.ratings.get(c.rating) ?? "",
    logonTime: c.logon_time,
    atis: c.text_atis,
    atisCode: c.atis_code ?? null,
    kind: "unknown",
  };
  if (facility === "CTR" || facility === "FSS") {
    const b = firBoundaries(parts);
    return b ? { ...base, kind: "fir", boundaries: b } : base;
  }
  if (facility === "APP" || facility === "DEP") {
    const tracon = traconByPrefix.get(parts.slice(0, -1).join("_")) ?? traconByPrefix.get(parts[0]);
    if (tracon) return { ...base, kind: "tracon", tracon };
    const ap = airportFor(parts[0]);
    return ap ? { ...base, kind: "approach", airport: ap } : base;
  }
  const ap = airportFor(parts[0]);
  return ap ? { ...base, kind: "airport", airport: ap } : base;
}

/** Online controllers and ATIS, each resolved to what it covers on the map. */
export function atcStations(store: TrafficStore): AtcResponse {
  const stations = [...store.controllers, ...store.atis]
    // Observers, supervisors without a position, and "not active" frequency
    .filter((c) => c.facility !== 0 && c.frequency !== "199.998")
    .map((c) => resolve(c, store));
  return { updated: new Date(store.updated).toISOString(), stations };
}
