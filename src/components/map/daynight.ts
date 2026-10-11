import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { destination } from "@/lib/geo";

const RAD = Math.PI / 180;
const MAX_LAT = 85.051129; // Web Mercator limit
const EARTH_NM_PER_DEG = (3440.065 * Math.PI) / 180;

/** Subsolar point (latitude = declination, longitude where the sun is overhead). */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lon = ((((ra - gmst * 15) % 360) + 540) % 360) - 180;
  return { lat: dec, lon };
}

/**
 * Night bands, FR24 style: sun below the horizon, then civil, nautical and
 * astronomical twilight. Each band is drawn as a cap around the antisolar
 * point; caps stack, so per-cap opacities are chosen to reach a cumulative
 * darkness of 0.15 / 0.22 / 0.29 / 0.36.
 */
const BANDS: [sunAltitude: number, opacity: number][] = [
  [-0.833, 0.15],
  [-6, 0.082],
  [-12, 0.09],
  [-18, 0.099],
];

/**
 * Spherical cap of angular radius `radiusDeg` around (lat, lon) as a polygon
 * ring. Rings that enclose a pole are closed along the map edge so the fill
 * covers it; longitudes are unwrapped (MapLibre wraps them across the
 * antimeridian).
 */
function capRing(lat: number, lon: number, radiusDeg: number): [number, number][] {
  const ring: [number, number][] = [];
  const steps = 720;
  let prevLon = lon;
  for (let i = 0; i <= steps; i++) {
    const [la, lo] = destination(lat, lon, (i / steps) * 360, radiusDeg * EARTH_NM_PER_DEG);
    let l = lo;
    while (l - prevLon > 180) l -= 360;
    while (l - prevLon < -180) l += 360;
    prevLon = l;
    ring.push([l, Math.max(-MAX_LAT, Math.min(MAX_LAT, la))]);
  }
  const span = ring[ring.length - 1][0] - ring[0][0];
  if (Math.abs(span) > 180) {
    // The cap contains a pole: the ring went all the way around the globe.
    const pole = 90 - lat < radiusDeg ? MAX_LAT : -MAX_LAT;
    ring.push([ring[ring.length - 1][0], pole], [ring[0][0], pole], ring[0]);
  }
  return ring;
}

export function nightFeatures(date: Date): GeoJSON.FeatureCollection {
  const sun = subsolarPoint(date);
  const anti = { lat: -sun.lat, lon: sun.lon > 0 ? sun.lon - 180 : sun.lon + 180 };
  return {
    type: "FeatureCollection",
    features: BANDS.map(([alt, opacity]) => ({
      type: "Feature",
      properties: { a: opacity },
      // Sun altitude below `alt` <=> within (90 + alt) degrees of the antisolar point
      geometry: { type: "Polygon", coordinates: [capRing(anti.lat, anti.lon, 90 + alt)] },
    })),
  };
}

/** Add, refresh or remove the day/night layer (inserted below `beforeId`). */
export function syncNight(map: MLMap, on: boolean, beforeId?: string) {
  if (!on) {
    if (map.getLayer("night")) map.removeLayer("night");
    if (map.getSource("night")) map.removeSource("night");
    return;
  }
  const data = nightFeatures(new Date());
  const src = map.getSource("night") as GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource("night", { type: "geojson", data, tolerance: 0.2 });
  map.addLayer(
    {
      id: "night",
      type: "fill",
      source: "night",
      paint: { "fill-color": "#040e1c", "fill-opacity": ["get", "a"], "fill-antialias": true },
    },
    beforeId && map.getLayer(beforeId) ? beforeId : undefined,
  );
}
