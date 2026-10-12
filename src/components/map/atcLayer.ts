import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { destination } from "@/lib/geo";
import type { AtcResponse, AtcStation } from "@/lib/types";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const SOURCES = ["atc-fir", "atc-tracon", "atc-label", "atc-apt"] as const;
export const ATC_CLICK_LAYERS = ["atc-apt", "atc-tracon-fill", "atc-fir-fill"];
/** Letter badge per airport position, in display order. */
const LETTERS: [string, string][] = [
  ["DEL", "D"],
  ["GND", "G"],
  ["TWR", "T"],
  ["ATIS", "A"],
];

type Shapes = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; lon?: number; lat?: number }>;
let shapes: Promise<{ firs: Shapes; tracons: Shapes }> | null = null;
function loadShapes() {
  shapes ??= Promise.all([
    fetch("/atc/firs.geojson").then((r) => r.json() as Promise<Shapes>),
    fetch("/atc/tracons.geojson").then((r) => r.json() as Promise<Shapes>),
  ]).then(([firs, tracons]) => ({ firs, tracons }));
  shapes.catch(() => (shapes = null));
  return shapes;
}

/** Stations behind each clickable feature, keyed like "fir:EGTT". */
export const atcStationsByKey = new Map<string, AtcStation[]>();
let lastData: Record<(typeof SOURCES)[number], GeoJSON.FeatureCollection> | null = null;

/** Add the (empty) ATC sources and layers below the traffic layers. */
export function installAtcLayers(map: MLMap, isDark: boolean, beforeId: string) {
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: lastData?.[id] ?? EMPTY });
  const before = map.getLayer(beforeId) ? beforeId : undefined;
  map.addLayer({ id: "atc-fir-fill", type: "fill", source: "atc-fir", paint: { "fill-color": "#3d8fd6", "fill-opacity": 0.13 } }, before);
  map.addLayer({ id: "atc-fir-line", type: "line", source: "atc-fir", paint: { "line-color": "#6db4f0", "line-width": 1.4 } }, before);
  map.addLayer({ id: "atc-tracon-fill", type: "fill", source: "atc-tracon", paint: { "fill-color": "#e0913a", "fill-opacity": 0.16 } }, before);
  map.addLayer({ id: "atc-tracon-line", type: "line", source: "atc-tracon", paint: { "line-color": "#f2a65a", "line-width": 1.4 } }, before);
  map.addLayer(
    {
      id: "atc-label",
      type: "symbol",
      source: "atc-label",
      minzoom: 3,
      layout: {
        "text-field": ["get", "text"],
        "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
        "text-size": 11,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["case", ["==", ["get", "kind"], "tracon"], "#ffd3a3", isDark ? "#d6ebff" : "#174b80"],
        "text-halo-color": isDark ? "rgba(10,14,20,0.85)" : "rgba(255,255,255,0.9)",
        "text-halo-width": 1.5,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "atc-apt",
      type: "symbol",
      source: "atc-apt",
      minzoom: 4,
      layout: {
        "text-field": ["get", "text"],
        "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
        "text-size": 10,
        "text-letter-spacing": 0.15,
        "text-anchor": "bottom",
        "text-offset": [0, -2.1],
        "text-allow-overlap": true,
      },
      // Halo turns the letters into a small blue pill above the airport pin
      paint: { "text-color": "#ffffff", "text-halo-color": "#2f7fd1", "text-halo-width": 3 },
    },
    before,
  );
}

function circle(lat: number, lon: number, radiusNm: number): GeoJSON.Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const [la, lo] = destination(lat, lon, (i / 64) * 360, radiusNm);
    ring.push([lo, la]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

/** Rough label point: centre of the largest ring's bounding box. */
function labelPoint(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  let best = rings[0];
  let bestArea = -1;
  for (const r of rings) {
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) {
      bestArea = area;
      best = r;
    }
  }
  const xs = best.map((p) => p[0]), ys = best.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

const labelText = (list: AtcStation[]) => {
  const names = [...new Set(list.map((s) => s.callsign))];
  return names.length > 2 ? `${names.slice(0, 2).join("\n")}\n+${names.length - 2}` : names.join("\n");
};

function build(data: AtcResponse, firs: Shapes, tracons: Shapes) {
  atcStationsByKey.clear();
  const add = (key: string, s: AtcStation) => atcStationsByKey.set(key, [...(atcStationsByKey.get(key) ?? []), s]);
  for (const s of data.stations) {
    if (s.kind === "fir") for (const b of s.boundaries ?? []) add(`fir:${b}`, s);
    else if (s.kind === "tracon" && s.tracon) add(`tracon:${s.tracon}`, s);
    else if (s.kind === "approach" && s.airport) add(`circle:${s.airport.icao}`, s);
    else if (s.kind === "airport" && s.airport) add(`apt:${s.airport.icao}`, s);
  }

  const fir: GeoJSON.Feature[] = [];
  const tracon: GeoJSON.Feature[] = [];
  const label: GeoJSON.Feature[] = [];
  const apt: GeoJSON.Feature[] = [];
  const firById = new Map(firs.features.map((f) => [f.properties.id, f]));
  const traconById = new Map(tracons.features.map((f) => [f.properties.id, f]));

  for (const [key, list] of atcStationsByKey) {
    const [kind, id] = key.split(":");
    if (kind === "fir") {
      const f = firById.get(id);
      if (!f) continue;
      fir.push({ type: "Feature", properties: { key }, geometry: f.geometry });
      const at: [number, number] = f.properties.lon !== undefined && f.properties.lat !== undefined ? [f.properties.lon, f.properties.lat] : labelPoint(f.geometry);
      label.push({ type: "Feature", properties: { kind: "fir", text: labelText(list) }, geometry: { type: "Point", coordinates: at } });
    } else if (kind === "tracon" || kind === "circle") {
      const geometry = kind === "tracon" ? traconById.get(id)?.geometry : list[0].airport && circle(list[0].airport.lat, list[0].airport.lon, 30);
      if (!geometry) continue;
      tracon.push({ type: "Feature", properties: { key }, geometry });
      label.push({ type: "Feature", properties: { kind: "tracon", text: labelText(list) }, geometry: { type: "Point", coordinates: labelPoint(geometry) } });
    } else if (kind === "apt") {
      const a = list[0].airport!;
      const open = new Set(list.map((s) => s.facility));
      const letters = LETTERS.filter(([f]) => open.has(f)).map(([, l]) => l);
      if (!letters.length) letters.push("•");
      apt.push({ type: "Feature", properties: { key, text: letters.join(" ") }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } });
    }
  }
  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
  return { "atc-fir": fc(fir), "atc-tracon": fc(tracon), "atc-label": fc(label), "atc-apt": fc(apt) };
}

function push(map: MLMap) {
  for (const id of SOURCES) (map.getSource(id) as GeoJSONSource | undefined)?.setData(lastData?.[id] ?? EMPTY);
}

/** Fetch online ATC and draw it (or clear it when `on` is false). */
export async function syncAtc(map: MLMap, on: boolean) {
  if (!on) {
    lastData = null;
    atcStationsByKey.clear();
    push(map);
    return;
  }
  try {
    const [{ firs, tracons }, data] = await Promise.all([
      loadShapes(),
      fetch("/api/atc", { cache: "no-store" }).then((r) => r.json() as Promise<AtcResponse>),
    ]);
    lastData = build(data, firs, tracons);
    push(map);
  } catch (e) {
    console.warn("[atc] update failed", e);
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const NAMES: Record<string, string> = { CTR: "Center", FSS: "Flight service", APP: "Approach", DEP: "Departure", TWR: "Tower", GND: "Ground", DEL: "Delivery", ATIS: "ATIS", RMP: "Ramp" };

/** HTML for the controller list shown when an ATC area or badge is clicked. */
export function atcPopupHtml(key: string): string | null {
  const list = atcStationsByKey.get(key);
  if (!list?.length) return null;
  const title = list[0].airport?.name ?? key.split(":")[1];
  const rows = list
    .map((s) => {
      const since = new Date(s.logonTime).toISOString().slice(11, 16);
      const atis = s.atis?.length ? `<p class="atis">${esc(s.atis.join(" "))}</p>` : "";
      return `<li><div class="row"><b>${esc(s.callsign)}</b><span class="freq">${esc(s.frequency)}</span></div>
        <div class="sub">${esc(NAMES[s.facility] ?? s.facility)}${s.atisCode ? ` · Info ${esc(s.atisCode)}` : ""} · ${esc(s.name)}${s.rating ? ` · ${esc(s.rating)}` : ""} · since ${since}Z</div>${atis}</li>`;
    })
    .join("");
  return `<div class="fr-atc"><h3>${esc(title)}</h3><ul>${rows}</ul></div>`;
}
