import type { Silhouette } from "@/data/aircraft";

// ---- VATSIM v3 data feed --------------------------------------------------

export interface VatsimFlightPlan {
  flight_rules: string;
  aircraft: string;
  aircraft_faa: string;
  aircraft_short: string;
  departure: string;
  arrival: string;
  alternate: string;
  cruise_tas: string;
  altitude: string;
  deptime: string;
  enroute_time: string;
  fuel_time: string;
  remarks: string;
  route: string;
  revision_id: number;
  assigned_transponder: string;
}

export interface VatsimPilot {
  cid: number;
  name: string;
  callsign: string;
  server: string;
  pilot_rating: number;
  military_rating: number;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  transponder: string;
  heading: number;
  qnh_i_hg: number;
  qnh_mb: number;
  flight_plan: VatsimFlightPlan | null;
  logon_time: string;
  last_updated: string;
}

export interface VatsimPrefile {
  cid: number;
  name: string;
  callsign: string;
  flight_plan: VatsimFlightPlan | null;
  last_updated: string;
}

export interface VatsimController {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: number;
  rating: number;
  server: string;
  visual_range: number;
  text_atis: string[] | null;
  last_updated: string;
  logon_time: string;
  atis_code?: string;
}

export interface VatsimFeed {
  general: { update_timestamp: string; connected_clients: number; unique_users: number };
  pilots: VatsimPilot[];
  controllers: VatsimController[];
  atis: VatsimController[];
  prefiles: VatsimPrefile[];
  facilities: { id: number; short: string; long: string }[];
  ratings: { id: number; short: string; long: string }[];
  pilot_ratings: { id: number; short_name: string; long_name: string }[];
}

// ---- Reference data -------------------------------------------------------

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  elevation: number;
  tz: string | null;
  /** 0 = heliport … 4 = large scheduled hub */
  size: number;
}

export interface Airline {
  icao: string;
  iata: string;
  name: string;
  callsign: string;
  country: string;
}

// ---- API payloads ---------------------------------------------------------

/** Compact live-map row, see FLIGHT_FIELDS for the order. */
export type FlightRow = [
  callsign: string,
  lat: number,
  lon: number,
  heading: number,
  altitude: number,
  groundspeed: number,
  type: string,
  origin: string,
  destination: string,
  squawk: string,
  verticalSpeed: number,
  onGround: 0 | 1,
  silhouette: Silhouette,
  registration: string,
];

export interface FlightsResponse {
  updated: string;
  serverTime: number;
  stats: { pilots: number; controllers: number; users: number };
  flights: FlightRow[];
}

export type FlightStatus = "scheduled" | "taxiing" | "departed" | "enroute" | "approach" | "landed" | "unknown";

export interface MiniAirport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  tz: string | null;
}

export interface FlightDetail {
  callsign: string;
  flightNumber: string | null;
  cid: number;
  name: string;
  server: string;
  pilotRating: string;
  logonTime: string;
  lastUpdated: string;
  status: FlightStatus;
  position: {
    lat: number;
    lon: number;
    altitude: number;
    groundspeed: number;
    heading: number;
    verticalSpeed: number;
    squawk: string;
    qnhMb: number;
    onGround: boolean;
  };
  airline: Airline | null;
  aircraft: {
    code: string;
    name: string;
    silhouette: Silhouette;
    registration: string | null;
    wake: string | null;
    equipment: string | null;
  };
  flightPlan: VatsimFlightPlan | null;
  origin: MiniAirport | null;
  destination: MiniAirport | null;
  alternate: MiniAirport | null;
  progress: { flownNm: number; remainingNm: number; totalNm: number; pct: number } | null;
  times: {
    scheduledDeparture: number | null;
    actualDeparture: number | null;
    scheduledArrival: number | null;
    estimatedArrival: number | null;
    actualArrival: number | null;
  };
  /** [lon, lat, altitude, groundspeed, unix seconds] */
  trail: [number, number, number, number, number][];
}

export interface BoardEntry {
  callsign: string;
  flightNumber: string | null;
  airline: Airline | null;
  aircraft: string;
  aircraftName: string;
  registration: string | null;
  /** The *other* end of the flight */
  airport: MiniAirport | null;
  status: FlightStatus;
  online: boolean;
  scheduled: number | null;
  actual: number | null;
  estimated: number | null;
  pilot: string;
}

export interface AirportController {
  callsign: string;
  name: string;
  frequency: string;
  facility: string;
  rating: string;
  logonTime: string;
  atis: string[] | null;
  atisCode: string | null;
}

export interface AirportDetail {
  airport: MiniAirport & { elevation: number; size: number };
  arrivals: BoardEntry[];
  departures: BoardEntry[];
  onGround: BoardEntry[];
  controllers: AirportController[];
  stats: { arrivals: number; departures: number; onGround: number };
}

export interface SearchResults {
  flights: { callsign: string; type: string; origin: string; destination: string; airline: string | null }[];
  airports: MiniAirport[];
  airlines: (Airline & { live: number })[];
}
