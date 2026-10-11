import type { FlightStatus } from "./types";

export function fmtTime(ts: number | null | undefined, tz?: string | null): string {
  if (ts === null || ts === undefined) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || "UTC",
    }).format(ts * 1000);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(ts * 1000);
  }
}

export function tzAbbr(tz: string | null | undefined, ts = Date.now() / 1000): string {
  if (!tz) return "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(ts * 1000);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "UTC";
  }
}

export function fmtDate(ts: number, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz || "UTC" }).format(ts * 1000);
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export const nf = new Intl.NumberFormat("en-US");

export function fmtAltitude(ft: number, unit: "ft" | "m" = "ft"): string {
  return unit === "m" ? `${nf.format(Math.round(ft * 0.3048))} m` : `${nf.format(Math.round(ft))} ft`;
}

export function fmtSpeed(kt: number, unit: "kt" | "kmh" | "mph" = "kt"): string {
  if (unit === "kmh") return `${nf.format(Math.round(kt * 1.852))} km/h`;
  if (unit === "mph") return `${nf.format(Math.round(kt * 1.15078))} mph`;
  return `${nf.format(Math.round(kt))} kts`;
}

export function fmtDistance(nm: number, unit: "nm" | "km" | "mi" = "nm"): string {
  if (unit === "km") return `${nf.format(Math.round(nm * 1.852))} km`;
  if (unit === "mi") return `${nf.format(Math.round(nm * 1.15078))} mi`;
  return `${nf.format(Math.round(nm))} NM`;
}

export function fmtVs(fpm: number, unit: "ft" | "m" = "ft"): string {
  const v = Math.round(fpm / 64) * 64;
  if (Math.abs(v) < 100) return unit === "m" ? "0 m/s" : "0 fpm";
  if (unit === "m") return `${v > 0 ? "+" : ""}${(v * 0.00508).toFixed(1)} m/s`;
  return `${v > 0 ? "+" : ""}${nf.format(v)} fpm`;
}

/** Trail/altitude colour scale (feet → colour), shared by the map and the legend. */
export const ALTITUDE_STOPS: [number, string][] = [
  [0, "#f5c400"],
  [2000, "#c7d300"],
  [6000, "#5fd35b"],
  [12000, "#15c8a8"],
  [20000, "#1d9ee6"],
  [30000, "#4a5ef0"],
  [40000, "#b23ce0"],
];

export function altitudeColor(ft: number): string {
  for (let i = ALTITUDE_STOPS.length - 1; i >= 0; i--) if (ft >= ALTITUDE_STOPS[i][0]) return ALTITUDE_STOPS[i][1];
  return ALTITUDE_STOPS[0][1];
}

export const STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: "Scheduled",
  taxiing: "Taxiing",
  departed: "Departed",
  enroute: "En route",
  approach: "On approach",
  landed: "Landed",
  unknown: "Unknown",
};

/** "10:45" + "PM" in the given time zone (FR24 shows 12-hour local times). */
export function fmtTime12(ts: number | null | undefined, tz?: string | null): { time: string; ampm: string } | null {
  if (ts === null || ts === undefined) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz || "UTC" }).formatToParts(ts * 1000);
    const time = parts.filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal").map((p) => p.value).join("").trim();
    const ampm = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
    return { time, ampm };
  } catch {
    return null;
  }
}

/** "CEST (UTC +02:00)" for an IANA zone. */
export function tzLabel(tz: string | null | undefined, ts = Date.now() / 1000): string {
  if (!tz) return "UTC";
  try {
    const short = (locale: string) =>
      new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" }).formatToParts(ts * 1000).find((p) => p.type === "timeZoneName")?.value ?? "";
    const named = (v: string) => v && !/^(GMT|UTC)/.test(v);
    // en-GB knows European names (CEST, BST), en-US the American ones (EDT, PDT)
    const abbr = [short("en-GB"), short("en-US")].find(named) ?? "";
    const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(ts * 1000).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const offset = off === "GMT" ? "+00:00" : off.replace("GMT", "");
    const utc = `UTC ${offset}`;
    return abbr ? `${abbr} (${utc})` : utc;
  } catch {
    return "UTC";
  }
}

/** Duration as "HH:MM" (FR24 progress style). */
export function fmtHM(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.round(seconds / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
