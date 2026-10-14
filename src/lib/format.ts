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

/**
 * FR24 trail colour scale: altitude (metres) → colour, interpolated between stops.
 * White on the ground or below 100 m, pure red above 13,000 m.
 */
export const ALTITUDE_STOPS: [number, string][] = [
  [100, "#ffe062"],
  [400, "#ffea00"],
  [700, "#ccff00"],
  [1000, "#1eff00"],
  [1700, "#00ff36"],
  [2400, "#00ff9c"],
  [3000, "#00ffe4"],
  [4000, "#00c0ff"],
  [5000, "#0078ff"],
  [6000, "#0030ff"],
  [7300, "#0000ff"],
  [8700, "#3600ff"],
  [10000, "#6000ff"],
  [11000, "#9600ff"],
  [12000, "#d800ff"],
  [13000, "#ff00e4"],
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function altitudeColor(ft: number, onGround = false): string {
  const m = ft * 0.3048;
  if (onGround || m < ALTITUDE_STOPS[0][0]) return "#ffffff";
  for (let i = 1; i < ALTITUDE_STOPS.length; i++) {
    const [m1, c1] = ALTITUDE_STOPS[i];
    if (m > m1) continue;
    const [m0, c0] = ALTITUDE_STOPS[i - 1];
    const k = (m - m0) / (m1 - m0);
    const [a, b] = [rgb(c0), rgb(c1)];
    return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, "0")).join("");
  }
  return "#ff0000";
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
