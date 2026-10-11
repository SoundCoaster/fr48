import airportsJson from "@/data/airports.json";
import airlinesJson from "@/data/airlines.json";
import countriesJson from "@/data/countries.json";
import type { Airline, Airport } from "./types";

let byIcao: Map<string, Airport> | null = null;
let byIata: Map<string, Airport> | null = null;

function index() {
  if (byIcao) return;
  byIcao = new Map();
  byIata = new Map();
  const countries = countriesJson as Record<string, string>;
  for (const r of airportsJson.rows as (string | number)[][]) {
    const [icao, iata, name, city, country, lat, lon, elev, tz, size] = r;
    const a: Airport = {
      icao: icao as string,
      iata: iata as string,
      name: name as string,
      city: city as string,
      countryCode: country as string,
      country: countries[country as string] || (country as string),
      lat: lat as number,
      lon: lon as number,
      elevation: elev as number,
      tz: (tz as string) || null,
      size: size as number,
    };
    byIcao.set(a.icao, a);
    // Prefer the biggest airport when an IATA code is shared
    if (a.iata && (!byIata!.has(a.iata) || byIata!.get(a.iata)!.size < a.size)) byIata!.set(a.iata, a);
  }
}

export function airport(code: string | undefined | null): Airport | null {
  if (!code) return null;
  index();
  const c = code.toUpperCase();
  return byIcao!.get(c) ?? (c.length === 3 ? byIata!.get(c) ?? null : null);
}

export function allAirports(): Iterable<Airport> {
  index();
  return byIcao!.values();
}

const airlines = airlinesJson as unknown as Record<string, [string, string, string, string]>;

/** Resolve the operating airline from a callsign like "AFR123" or an OPR/ remark. */
export function airlineFromCallsign(callsign: string, remarks?: string): Airline | null {
  const m = /^([A-Z]{3})\d/.exec(callsign.toUpperCase());
  const code = m?.[1] ?? /\bOPR\/([A-Z]{3})\b/.exec(remarks || "")?.[1];
  return code ? airlineByIcao(code) : null;
}

export function airlineByIcao(code: string): Airline | null {
  const a = airlines[code.toUpperCase()];
  return a ? { icao: code.toUpperCase(), name: a[0], callsign: a[1], country: a[2], iata: a[3] } : null;
}

export function allAirlines(): Airline[] {
  return Object.entries(airlines).map(([icao, a]) => ({ icao, name: a[0], callsign: a[1], country: a[2], iata: a[3] }));
}
