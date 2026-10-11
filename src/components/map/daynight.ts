import type { ImageSource, Map as MLMap } from "maplibre-gl";

const RAD = Math.PI / 180;
const MAX_LAT = 85.051129; // Web Mercator limit

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
 * Night shading in FR24-style steps: sun below the horizon, then civil,
 * nautical and astronomical twilight get progressively darker.
 */
const BANDS: [altitude: number, alpha: number][] = [
  [-18, 0.36],
  [-12, 0.29],
  [-6, 0.22],
  [-0.833, 0.15],
];

const W = 720;
const H = 720;

/** Render the night overlay for `date` into an equal-Mercator canvas. */
export function drawNight(canvas: HTMLCanvasElement, date: Date) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const sun = subsolarPoint(date);
  const sinD = Math.sin(sun.lat * RAD);
  const cosD = Math.cos(sun.lat * RAD);
  // Pre-compute cos(lon - sunLon) per column
  const cosH = new Float64Array(W);
  for (let x = 0; x < W; x++) cosH[x] = Math.cos(((x + 0.5) / W * 360 - 180 - sun.lon) * RAD);
  const yMax = Math.log(Math.tan(Math.PI / 4 + (MAX_LAT * RAD) / 2));

  for (let y = 0; y < H; y++) {
    // Rows are evenly spaced in Mercator y, not latitude
    const my = yMax * (1 - (2 * (y + 0.5)) / H);
    const lat = 2 * Math.atan(Math.exp(my)) - Math.PI / 2;
    const sinP = Math.sin(lat);
    const cosP = Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const alt = Math.asin(sinP * sinD + cosP * cosD * cosH[x]) / RAD;
      let a = 0;
      for (const [limit, alpha] of BANDS) {
        if (alt < limit) {
          a = alpha;
          break;
        }
      }
      if (a) {
        const i = (y * W + x) * 4;
        img.data[i] = 4;
        img.data[i + 1] = 14;
        img.data[i + 2] = 28;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

const COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MAX_LAT],
  [180, MAX_LAT],
  [180, -MAX_LAT],
  [-180, -MAX_LAT],
];

let canvas: HTMLCanvasElement | null = null;

/** Add, refresh or remove the day/night layer (inserted below `beforeId`). */
export function syncNight(map: MLMap, on: boolean, beforeId?: string) {
  if (!on) {
    if (map.getLayer("night")) map.removeLayer("night");
    if (map.getSource("night")) map.removeSource("night");
    return;
  }
  canvas ??= document.createElement("canvas");
  drawNight(canvas, new Date());
  const url = canvas.toDataURL("image/png");
  const src = map.getSource("night") as ImageSource | undefined;
  if (src) {
    src.updateImage({ url, coordinates: COORDS });
    return;
  }
  map.addSource("night", { type: "image", url, coordinates: COORDS });
  map.addLayer(
    { id: "night", type: "raster", source: "night", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } },
    beforeId && map.getLayer(beforeId) ? beforeId : undefined,
  );
}
