import { aircraftInfo } from "@/data/aircraft";
import { distanceNm } from "./geo";
import { registration } from "./registration";

export { registration };
import { airlineByIcao, airlineFromCallsign, airport, allAirlines, allAirports } from "./refdata";
import { TRAIL_STRIDE, type TrafficStore, type Track } from "./traffic-store";
import type {
  Airline,
  Airport,
  AirportController,
  AirportDetail,
  BoardEntry,
  FlightDetail,
  FlightRow,
  FlightsResponse,
  FlightStatus,
  MiniAirport,
  SearchResults,
  VatsimFlightPlan,
  VatsimPrefile,
} from "./types";

// ---- Flight plan helpers --------------------------------------------------


function wakeAndEquipment(fp: VatsimFlightPlan | null): { wake: string | null; equipment: string | null } {
  if (!fp?.aircraft) return { wake: null, equipment: null };
  // ICAO format "B738/M-SDE2E3FGHIRWY/LB1"
  const parts = fp.aircraft.split("/");
  const wakeEq = parts[1] ?? "";
  const [wake, equipment] = wakeEq.split("-");
  return { wake: wake || null, equipment: equipment || null };
}

const WAKE: Record<string, string> = { L: "Light", M: "Medium", H: "Heavy", J: "Super" };
export const wakeName = (w: string | null) => (w ? WAKE[w] ?? w : null);

/** Parse an "HHMM" UTC time from the flight plan into a unix timestamp near `ref`. */
function fpTime(hhmm: string | undefined, ref: number, remarks?: string): number | null {
  if (!hhmm || !/^\d{3,4}$/.test(hhmm)) return null;
  const v = hhmm.padStart(4, "0");
  const h = +v.slice(0, 2), m = +v.slice(2);
  if (h > 23 || m > 59) return null;
  const dof = /\bDOF\/(\d{2})(\d{2})(\d{2})\b/.exec(remarks || "");
  if (dof) {
    const ts = Date.UTC(2000 + +dof[1], +dof[2] - 1, +dof[3], h, m) / 1000;
    // Ignore stale DOFs (old flight plans reused for days)
    if (Math.abs(ts - ref) < 36 * 3600) return ts;
  }
  const d = new Date(ref * 1000);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) / 1000;
  return [base - 86400, base, base + 86400].reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a));
}

function durationS(hhmm: string | undefined): number | null {
  if (!hhmm || !/^\d{1,4}$/.test(hhmm)) return null;
  const v = hhmm.padStart(4, "0");
  const s = (+v.slice(0, 2) * 60 + +v.slice(2)) * 60;
  return s > 0 ? s : null;
}

export function flightNumber(callsign: string, airline: Airline | null): string | null {
  const m = /^[A-Z]{3}(\d[A-Z0-9]*)$/.exec(callsign);
  if (!m || !airline) return null;
  return airline.iata ? `${airline.iata}${m[1]}` : null;
}

export function mini(a: Airport | null): MiniAirport | null {
  if (!a) return null;
  return {
    icao: a.icao, iata: a.iata, name: a.name, city: a.city, country: a.country,
    countryCode: a.countryCode, lat: a.lat, lon: a.lon, tz: a.tz,
  };
}

// ---- Status & times -------------------------------------------------------

interface Derived {
  origin: Airport | null;
  destination: Airport | null;
  status: FlightStatus;
  scheduledDeparture: number | null;
  scheduledArrival: number | null;
  estimatedArrival: number | null;
  remainingNm: number | null;
}

function derive(tr: Track, now: number): Derived {
  const fp = tr.fp;
  const origin = airport(fp?.departure);
  const destination = airport(fp?.arrival);
  const ref = tr.takeoffAt ?? Date.parse(tr.logon) / 1000;
  const scheduledDeparture = fpTime(fp?.deptime, ref, fp?.remarks);
  const enroute = durationS(fp?.enroute_time);
  const scheduledArrival = scheduledDeparture !== null && enroute ? scheduledDeparture + enroute : null;
  const remainingNm = destination ? distanceNm(tr.lat, tr.lon, destination.lat, destination.lon) : null;

  let status: FlightStatus = "unknown";
  let estimatedArrival: number | null = null;
  if (tr.onGround) {
    const atDest = remainingNm !== null && remainingNm < 6;
    if (tr.landedAt !== null || (atDest && tr.everAirborne)) status = "landed";
    else if (atDest && origin?.icao !== destination?.icao) status = "landed";
    else status = tr.gs > 3 ? "taxiing" : "scheduled";
  } else {
    status = tr.takeoffAt !== null && now - tr.takeoffAt < 300 ? "departed" : "enroute";
    if (remainingNm !== null && remainingNm < 60 && tr.vs < -200) status = "approach";
  }
  if (status !== "landed" && destination) {
    if (!tr.onGround && tr.gs > 80 && remainingNm !== null) {
      // Assume ~12 minutes of approach slow-down on top of straight-line time
      estimatedArrival = now + (remainingNm / tr.gs) * 3600 + Math.min(720, remainingNm * 6);
    } else if (scheduledArrival) {
      const delay = scheduledDeparture !== null ? Math.max(0, now - scheduledDeparture) : 0;
      estimatedArrival = scheduledArrival + delay;
    }
  }
  return { origin, destination, status, scheduledDeparture, scheduledArrival, estimatedArrival, remainingNm };
}

// ---- Live map rows --------------------------------------------------------

const endpoint = (a: Airport | null) => (a ? { city: a.city || a.name, code: a.iata || a.icao } : null);

function trackedFlights(store: TrafficStore, viewers: Map<string, number>): FlightsResponse["tracked"] {
  return [...viewers]
    .filter(([cs]) => store.byCallsign.has(cs))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cs, n]) => {
      const tr = store.byCallsign.get(cs)!;
      return {
        callsign: cs,
        flightNumber: flightNumber(cs, airlineFromCallsign(cs, tr.fp?.remarks)),
        type: tr.fp?.aircraft_short || "",
        viewers: n,
        origin: endpoint(airport(tr.fp?.departure)),
        destination: endpoint(airport(tr.fp?.arrival)),
      };
    });
}

function busiestAirports(store: TrafficStore): FlightsResponse["busiest"] {
  const counts = new Map<string, [number, number]>();
  for (const tr of store.byCallsign.values()) {
    if (!tr.fp) continue;
    // Only count flights still to arrive / depart
    if (tr.fp.arrival && tr.landedAt === null) {
      const c = counts.get(tr.fp.arrival) ?? [0, 0];
      c[0]++;
      counts.set(tr.fp.arrival, c);
    }
    if (tr.fp.departure && tr.takeoffAt === null && tr.onGround) {
      const c = counts.get(tr.fp.departure) ?? [0, 0];
      c[1]++;
      counts.set(tr.fp.departure, c);
    }
  }
  return [...counts]
    .sort((a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1]))
    .slice(0, 5)
    .flatMap(([icao, [arrivals, departures]]) => {
      const a = airport(icao);
      return a ? [{ icao: a.icao, iata: a.iata, city: a.city || a.name, arrivals, departures }] : [];
    });
}

export function flightRows(store: TrafficStore, viewers: Map<string, number> = new Map()): FlightsResponse {
  const flights: FlightRow[] = [];
  for (const tr of store.byCallsign.values()) {
    const fp = tr.fp;
    const type = fp?.aircraft_short || "";
    flights.push([
      tr.callsign,
      tr.lat,
      tr.lon,
      tr.hdg,
      tr.alt,
      tr.gs,
      type,
      fp?.departure || "",
      fp?.arrival || "",
      tr.sq,
      tr.vs,
      tr.onGround ? 1 : 0,
      aircraftInfo(type).silhouette,
      registration(fp?.remarks) || "",
    ]);
  }
  return {
    updated: new Date(store.updated).toISOString(),
    serverTime: Date.now(),
    stats: store.stats,
    flights,
    tracked: trackedFlights(store, viewers),
    busiest: busiestAirports(store),
  };
}

// ---- Flight detail --------------------------------------------------------

export function flightDetail(store: TrafficStore, callsign: string): FlightDetail | null {
  const tr = store.byCallsign.get(callsign.toUpperCase());
  if (!tr) return null;
  const now = store.updated / 1000;
  const fp = tr.fp;
  const d = derive(tr, now);
  const airline = airlineFromCallsign(tr.callsign, fp?.remarks);
  const ac = aircraftInfo(fp?.aircraft_short);
  const { wake, equipment } = wakeAndEquipment(fp);

  let progress: FlightDetail["progress"] = null;
  if (d.origin && d.destination) {
    const totalNm = distanceNm(d.origin.lat, d.origin.lon, d.destination.lat, d.destination.lon);
    const flownNm = distanceNm(d.origin.lat, d.origin.lon, tr.lat, tr.lon);
    const remainingNm = d.remainingNm ?? 0;
    const pct = d.status === "landed" ? 100 : Math.max(0, Math.min(100, (flownNm / (flownNm + remainingNm || 1)) * 100));
    progress = { flownNm: Math.round(flownNm), remainingNm: Math.round(remainingNm), totalNm: Math.round(totalNm), pct };
  }

  const trail: FlightDetail["trail"] = [];
  for (let i = 0; i < tr.trail.length; i += TRAIL_STRIDE) {
    const s = tr.trail;
    trail.push([s[i + 1], s[i], s[i + 2], s[i + 3], s[i + 5]]);
  }

  return {
    callsign: tr.callsign,
    flightNumber: flightNumber(tr.callsign, airline),
    cid: tr.cid,
    name: tr.name,
    server: tr.server,
    pilotRating: store.pilotRatings.get(tr.rating) ?? "",
    logonTime: tr.logon,
    lastUpdated: tr.lastUpdated,
    status: d.status,
    position: {
      lat: tr.lat, lon: tr.lon, altitude: tr.alt, groundspeed: tr.gs, heading: tr.hdg,
      verticalSpeed: tr.vs, squawk: tr.sq, qnhMb: tr.qnh, onGround: tr.onGround,
    },
    airline,
    aircraft: { code: ac.code, name: ac.name, silhouette: ac.silhouette, registration: registration(fp?.remarks), wake, equipment },
    flightPlan: fp,
    origin: mini(d.origin),
    destination: mini(d.destination),
    alternate: mini(airport(fp?.alternate)),
    progress,
    times: {
      scheduledDeparture: d.scheduledDeparture,
      actualDeparture: tr.takeoffAt,
      scheduledArrival: d.scheduledArrival,
      estimatedArrival: d.estimatedArrival,
      actualArrival: tr.landedAt,
    },
    trail,
  };
}

// ---- Airport boards -------------------------------------------------------

function entryFromTrack(tr: Track, now: number, kind: "arr" | "dep"): BoardEntry {
  const d = derive(tr, now);
  const airline = airlineFromCallsign(tr.callsign, tr.fp?.remarks);
  const ac = aircraftInfo(tr.fp?.aircraft_short);
  return {
    callsign: tr.callsign,
    flightNumber: flightNumber(tr.callsign, airline),
    airline,
    aircraft: ac.code,
    aircraftName: ac.name,
    registration: registration(tr.fp?.remarks),
    airport: mini(kind === "arr" ? d.origin : d.destination),
    status: d.status,
    online: tr.online,
    scheduled: kind === "arr" ? d.scheduledArrival : d.scheduledDeparture,
    actual: kind === "arr" ? tr.landedAt : tr.takeoffAt,
    estimated: kind === "arr" ? d.estimatedArrival : null,
    pilot: tr.name,
  };
}

function entryFromPrefile(p: VatsimPrefile, now: number, kind: "arr" | "dep"): BoardEntry {
  const fp = p.flight_plan!;
  const airline = airlineFromCallsign(p.callsign, fp.remarks);
  const ac = aircraftInfo(fp.aircraft_short);
  const dep = fpTime(fp.deptime, now, fp.remarks);
  const enroute = durationS(fp.enroute_time);
  const arr = dep !== null && enroute ? dep + enroute : null;
  return {
    callsign: p.callsign,
    flightNumber: flightNumber(p.callsign, airline),
    airline,
    aircraft: ac.code,
    aircraftName: ac.name,
    registration: registration(fp.remarks),
    airport: mini(airport(kind === "arr" ? fp.departure : fp.arrival)),
    status: "scheduled",
    online: false,
    scheduled: kind === "arr" ? arr : dep,
    actual: null,
    estimated: kind === "arr" ? arr : null,
    pilot: p.name,
  };
}

const FACILITY_ORDER: Record<string, number> = { ATIS: 0, DEL: 1, GND: 2, TWR: 3, APP: 4, DEP: 5 };

export function airportDetail(store: TrafficStore, code: string): AirportDetail | null {
  const ap = airport(code);
  if (!ap) return null;
  const now = store.updated / 1000;
  const arrivals: BoardEntry[] = [];
  const departures: BoardEntry[] = [];
  const onGround: BoardEntry[] = [];

  for (const tr of store.tracks.values()) {
    const fp = tr.fp;
    if (!tr.online && tr.landedAt === null) continue;
    const isDep = fp?.departure === ap.icao;
    const isArr = fp?.arrival === ap.icao;
    if (isArr) arrivals.push(entryFromTrack(tr, now, "arr"));
    if (isDep) departures.push(entryFromTrack(tr, now, "dep"));
    if (tr.online && tr.onGround && distanceNm(tr.lat, tr.lon, ap.lat, ap.lon) < 4) {
      onGround.push(entryFromTrack(tr, now, isArr && !isDep ? "arr" : "dep"));
    }
  }
  for (const p of store.prefiles) {
    if (!p.flight_plan || store.byCallsign.has(p.callsign)) continue;
    if (p.flight_plan.departure === ap.icao) departures.push(entryFromPrefile(p, now, "dep"));
    if (p.flight_plan.arrival === ap.icao) arrivals.push(entryFromPrefile(p, now, "arr"));
  }

  const when = (e: BoardEntry) => e.actual ?? e.estimated ?? e.scheduled ?? Infinity;
  arrivals.sort((a, b) => when(a) - when(b));
  departures.sort((a, b) => when(a) - when(b));
  onGround.sort((a, b) => a.callsign.localeCompare(b.callsign));

  const prefixes = new Set([ap.icao]);
  if (ap.icao.startsWith("K") && ap.icao.length === 4) prefixes.add(ap.icao.slice(1));
  if (ap.iata) prefixes.add(ap.iata);
  const controllers: AirportController[] = [];
  for (const c of [...store.atis, ...store.controllers]) {
    const parts = c.callsign.split("_");
    const suffix = parts[parts.length - 1];
    if (!prefixes.has(parts[0]) || !(suffix in FACILITY_ORDER) || c.frequency === "199.998") continue;
    controllers.push({
      callsign: c.callsign,
      name: c.name,
      frequency: c.frequency,
      facility: suffix,
      rating: store.ratings.get(c.rating) ?? "",
      logonTime: c.logon_time,
      atis: c.text_atis,
      atisCode: c.atis_code ?? null,
    });
  }
  controllers.sort((a, b) => FACILITY_ORDER[a.facility] - FACILITY_ORDER[b.facility] || a.callsign.localeCompare(b.callsign));

  return {
    airport: { ...mini(ap)!, elevation: ap.elevation, size: ap.size },
    arrivals,
    departures,
    onGround,
    controllers,
    stats: {
      arrivals: arrivals.filter((e) => e.online && e.status !== "landed").length,
      departures: departures.filter((e) => e.online && e.status !== "landed" && e.actual === null).length,
      onGround: onGround.length,
    },
  };
}

// ---- Airports layer -------------------------------------------------------

/** [icao, iata, name, lat, lon, size, arrivals, departures, countryCode] */
export type AirportRow = [string, string, string, number, number, number, number, number, string];

export function airportRows(store: TrafficStore): AirportRow[] {
  const traffic = new Map<string, [number, number]>();
  for (const tr of store.byCallsign.values()) {
    if (!tr.fp) continue;
    const a = traffic.get(tr.fp.arrival) ?? [0, 0];
    a[0]++;
    traffic.set(tr.fp.arrival, a);
    const d = traffic.get(tr.fp.departure) ?? [0, 0];
    d[1]++;
    traffic.set(tr.fp.departure, d);
  }
  const rows: AirportRow[] = [];
  for (const a of allAirports()) {
    const t = traffic.get(a.icao);
    if (a.size < 3 && !t) continue;
    rows.push([a.icao, a.iata, a.name, a.lat, a.lon, a.size, t?.[0] ?? 0, t?.[1] ?? 0, a.countryCode]);
  }
  return rows;
}

// ---- Search ---------------------------------------------------------------

export function search(store: TrafficStore, query: string): SearchResults {
  const q = query.trim().toUpperCase();
  const res: SearchResults = { flights: [], airports: [], airlines: [] };
  if (q.length < 2) return res;

  const flightScore = (tr: Track) => {
    const reg = registration(tr.fp?.remarks)?.replace("-", "") ?? "";
    if (tr.callsign === q) return 0;
    if (tr.callsign.startsWith(q)) return 1;
    const fn = flightNumber(tr.callsign, airlineFromCallsign(tr.callsign));
    if (fn && fn.startsWith(q)) return 1;
    if (reg && reg.startsWith(q.replace("-", ""))) return 2;
    if (tr.callsign.includes(q)) return 3;
    return -1;
  };
  res.flights = [...store.byCallsign.values()]
    .map((tr) => [flightScore(tr), tr] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].callsign.localeCompare(b[1].callsign))
    .slice(0, 8)
    .map(([, tr]) => ({
      callsign: tr.callsign,
      type: tr.fp?.aircraft_short || "",
      origin: tr.fp?.departure || "",
      destination: tr.fp?.arrival || "",
      airline: airlineFromCallsign(tr.callsign)?.name ?? null,
    }));

  const scored: [number, Airport][] = [];
  for (const a of allAirports()) {
    let s = -1;
    if (a.icao === q || a.iata === q) s = 0;
    else if (a.icao.startsWith(q)) s = 2;
    else if (q.length >= 3 && a.city.toUpperCase().startsWith(q)) s = 3;
    else if (q.length >= 3 && a.name.toUpperCase().includes(q)) s = 4;
    if (s >= 0) scored.push([s * 10 - a.size, a]);
  }
  res.airports = scored.sort((a, b) => a[0] - b[0]).slice(0, 6).map(([, a]) => mini(a)!);

  const live = new Map<string, number>();
  for (const cs of store.byCallsign.keys()) {
    const p = /^([A-Z]{3})\d/.exec(cs)?.[1];
    if (p) live.set(p, (live.get(p) ?? 0) + 1);
  }
  const exact = airlineByIcao(q);
  const airlines = allAirlines()
    .filter((a) => a.icao !== q && (a.name.toUpperCase().includes(q) || (q.length === 2 && a.iata === q)))
    .map((a) => ({ ...a, live: live.get(a.icao) ?? 0 }))
    .filter((a) => a.live > 0)
    .sort((a, b) => b.live - a.live)
    .slice(0, 5);
  res.airlines = exact ? [{ ...exact, live: live.get(exact.icao) ?? 0 }, ...airlines] : airlines;
  return res;
}
