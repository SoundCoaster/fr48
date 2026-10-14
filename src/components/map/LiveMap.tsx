"use client";

import * as maplibregl from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, LineLayerSpecification, Map as MLMap, SymbolLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SILHOUETTE_SCALE, SILHOUETTES, type Silhouette } from "@/data/aircraft";
import { mapInstance } from "./instance";
import { motionAt, renderTime } from "@/lib/client/motion";
import type { View3D } from "./view3d";
import { ATC_CLICK_LAYERS, atcPopupHtml, installAtcLayers, syncAtc } from "./atcLayer";
import { syncNight } from "./daynight";
import { GoogleAttribution } from "./GoogleAttribution";
import { isDarkStyle, resolveStyle, STYLES } from "./styles";
import { useAirportRows, useFlightDetail, type AirportRow } from "@/lib/client/data";
import { getState, setState, subscribe, useStore, type Filters } from "@/lib/client/store";
import { altitudeColor, fmtAltitude, fmtSpeed } from "@/lib/format";
import { GROUND_SPEED_KT } from "@/lib/constants";
import { distanceNm, greatCircle, unwrap } from "@/lib/geo";
import type { FlightDetail, FlightRow } from "@/lib/types";

// Bundlers break MapLibre's self-located worker; serve it from /public instead (see postinstall).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

/** Aircraft PNGs are 128 px; at icon-size 1 they render as a 55 px slot. */
const PLANE_RATIO = 128 / 55;
/** Airport pins are 112 px tall; at icon-size 1 they render 28 px tall. */
const PIN_RATIO = 4;

/** Hijack, radio failure, general emergency: drawn in pure red like FR24. */
const EMERGENCY_SQUAWKS = new Set(["7500", "7600", "7700"]);

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** Register aircraft and airport icons (again after every style change). */
function addImages(map: MLMap) {
  const entries: [string, string, number][] = [
    ["airport", "/airport.png", PIN_RATIO],
    ["airport-hover", "/airport-hover.png", PIN_RATIO],
  ];
  for (const s of SILHOUETTES) {
    entries.push(
      [`plane-${s}`, `/aircraft/${s}.png`, PLANE_RATIO],
      [`plane-${s}-sel`, `/aircraft/${s}-sel.png`, PLANE_RATIO],
      [`plane-${s}-emg`, `/aircraft/${s}-emg.png`, PLANE_RATIO],
      [`shadow-${s}`, `/aircraft/${s}-shadow.png`, PLANE_RATIO],
    );
  }
  for (const [id, url, pixelRatio] of entries) {
    loadImage(url)
      .then((img) => {
        if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio });
      })
      .catch(() => console.warn("[map] missing icon", url));
  }
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Display {
  lat: number;
  lon: number;
  hdg: number;
}

function installLayers(map: MLMap) {
  addImages(map);
  const isDark = isDarkStyle(getState().settings.mapStyle);

  map.addSource("airports", { type: "geojson", data: EMPTY });
  map.addSource("route", { type: "geojson", data: EMPTY });
  map.addSource("trail", { type: "geojson", data: EMPTY });
  map.addSource("trail-live", { type: "geojson", data: EMPTY });
  map.addSource("trail-points", { type: "geojson", data: EMPTY });
  map.addSource("trail-gap", { type: "geojson", data: EMPTY });
  map.addSource("flights", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": isDark ? "#cfd6dd" : "#5f6b76",
      "line-width": 1.6,
      "line-dasharray": [2, 2.5],
    },
  });
  // Online ATC sits under the traffic (and above the day/night shading)
  installAtcLayers(map, isDark, "route");
  // Estimated part of a flight we only started tracking mid-air (departure -> first known point)
  map.addLayer({
    id: "trail-gap",
    type: "line",
    source: "trail-gap",
    layout: { "line-cap": "round" },
    paint: { "line-color": isDark ? "#e4e9ee" : "#4a5560", "line-opacity": 0.75, "line-width": 2, "line-dasharray": [0.8, 2] },
  });
  // No reception for over TRAIL_GAP_S: thin black dotted line, like FR24
  map.addLayer({
    id: "trail-nodata",
    type: "line",
    source: "trail",
    filter: ["has", "gap"],
    paint: { "line-color": "#000000", "line-width": 1, "line-dasharray": [2, 2] },
  });
  const trailLine = (id: string, source: string, filter?: FilterSpecification): LineLayerSpecification => ({
    id,
    type: "line",
    source,
    ...(filter && { filter }),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "c"], "line-width": 3 },
  });
  map.addLayer(trailLine("trail", "trail", ["!", ["has", "gap"]]));
  map.addLayer(trailLine("trail-live", "trail-live"));
  // One dot per recorded position; a wider invisible circle makes them easy to hover
  map.addLayer({
    id: "trail-points",
    type: "circle",
    source: "trail-points",
    paint: { "circle-radius": 1.5, "circle-color": ["get", "c"] },
  });
  map.addLayer({
    id: "trail-points-hit",
    type: "circle",
    source: "trail-points",
    paint: { "circle-radius": 6, "circle-opacity": 0 },
  });
  const pinLayout = {
    "icon-anchor": "bottom",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.36, 6, 0.5, 10, 0.75, 14, 1],
    "icon-allow-overlap": true,
  } satisfies SymbolLayerSpecification["layout"];
  map.addLayer({
    id: "airports-pin",
    type: "symbol",
    source: "airports",
    filter: ["any", ["==", ["get", "hl"], 1], [">=", ["zoom"], ["get", "minz"]]],
    layout: {
      ...pinLayout,
      "icon-image": ["case", ["==", ["get", "hl"], 1], "airport-hover", "airport"],
      "symbol-sort-key": ["get", "hl"],
    },
  });
  map.addLayer({
    id: "airports-pin-hover",
    type: "symbol",
    source: "airports",
    filter: ["==", ["get", "icao"], ""],
    // Hovered pin turns yellow and grows slightly
    layout: {
      ...pinLayout,
      "icon-image": "airport-hover",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.45, 6, 0.625, 10, 0.94, 14, 1.25],
    },
  });
  const planeIcon = {
    "icon-rotate": ["get", "h"],
    "icon-rotation-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-size": [
      "interpolate", ["linear"], ["zoom"],
      1, ["*", 0.45, ["get", "k"]],
      4, ["*", 0.62, ["get", "k"]],
      7, ["*", 0.8, ["get", "k"]],
      11, ["*", 0.92, ["get", "k"]],
      15, ["*", 1.2, ["get", "k"]],
    ],
  } satisfies SymbolLayerSpecification["layout"];
  // Soft drop shadow, offset in screen space so light always comes from the same side
  map.addLayer({
    id: "flights-shadow",
    type: "symbol",
    source: "flights",
    layout: { ...planeIcon, "icon-image": ["concat", "shadow-", ["get", "s"]] },
    paint: { "icon-translate": [1.5, 2.5], "icon-translate-anchor": "viewport", "icon-opacity": 0.9 },
  });
  map.addLayer({
    id: "flights",
    type: "symbol",
    source: "flights",
    layout: {
      ...planeIcon,
      // FR24 colours: selected first, then emergency squawk, then the default yellow
      "icon-image": [
        "concat", "plane-", ["get", "s"],
        ["case", ["==", ["get", "sel"], 1], "-sel", ["==", ["get", "emg"], 1], "-emg", ""],
      ],
      "symbol-sort-key": ["get", "sel"],
      "text-field": ["get", "lbl"],
      "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": isDark ? "#f2f4f7" : "#1d2730",
      "text-halo-color": isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)",
      "text-halo-width": 1.5,
    },
  });
  // Hovered aircraft switches to the highlight colour
  map.addLayer({
    id: "flights-hover",
    type: "symbol",
    source: "flights",
    filter: ["==", ["get", "cs"], ""],
    layout: { ...planeIcon, "icon-image": ["concat", "plane-", ["get", "s"], "-sel"] },
  });
}

// ---- Weather radar (RainViewer public API, free tiles up to zoom 7) ------

let radarPath: { host: string; path: string; at: number } | null = null;
async function latestRadar() {
  if (radarPath && Date.now() - radarPath.at < 5 * 60_000) return radarPath;
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  const d = (await res.json()) as { host: string; radar: { past: { path: string }[] } };
  const last = d.radar.past[d.radar.past.length - 1];
  radarPath = { host: d.host, path: last.path, at: Date.now() };
  return radarPath;
}

async function syncRadar(map: MLMap, on: boolean) {
  if (map.getLayer("radar")) map.removeLayer("radar");
  if (map.getSource("radar")) map.removeSource("radar");
  if (!on) return;
  try {
    const r = await latestRadar();
    if (map.getSource("radar") || !getState().settings.weather) return;
    map.addSource("radar", {
      type: "raster",
      tiles: [`${r.host}${r.path}/256/{z}/{x}/{y}/2/1_1.png`],
      tileSize: 256,
      maxzoom: 7,
      attribution: "Radar © RainViewer",
    });
    map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.7 } }, "route");
  } catch {
    console.warn("[map] weather radar unavailable");
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function airportLabelHtml(row: AirportRow): string {
  const [icao, iata, name, , , , , , cc] = row;
  const flag = /^[A-Z]{2}$/.test(cc) ? `<img src="https://flagcdn.com/h40/${cc.toLowerCase()}.png" alt="">` : "";
  return `<b>${esc(name)}</b><span>${flag}${esc([iata, icao].filter(Boolean).join(" / "))}</span>`;
}

/** On-screen pin height (px) at a zoom, mirroring the pin layer's icon-size. */
function pinHeight(zoom: number): number {
  const stops: [number, number][] = [[2, 0.36], [6, 0.5], [10, 0.75], [14, 1]];
  let k = stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, v0] = stops[i - 1], [z1, v1] = stops[i];
    if (zoom >= z0) k = zoom >= z1 ? v1 : v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0);
  }
  return 28 * k;
}

function matches(f: FlightRow, flt: Filters): boolean {
  const [cs, , , , alt, , type, dep, arr, , , ground] = f;
  if (flt.ground === "air" && ground) return false;
  if (flt.ground === "ground" && !ground) return false;
  if (alt < flt.altMin || (flt.altMax < 60000 && alt > flt.altMax)) return false;
  if (flt.airline && !cs.startsWith(flt.airline.toUpperCase())) return false;
  if (flt.aircraft && !type.startsWith(flt.aircraft.toUpperCase())) return false;
  if (flt.callsign && !cs.includes(flt.callsign.toUpperCase())) return false;
  if (flt.airport) {
    const a = flt.airport.toUpperCase();
    if (dep !== a && arr !== a) return false;
  }
  return true;
}

/** Two recorded positions further apart than this (s) mean the feed had no position in between. */
const TRAIL_GAP_S = 120;

interface TrailGeometry {
  lines: GeoJSON.Feature[];
  points: GeoJSON.Feature[];
  /** Last drawn position, where the live segment to the aircraft starts. */
  last: { lon: number; lat: number; c: string } | null;
}

/** Recorded trail as altitude-coloured segments, dotted no-reception gaps and position dots. */
function trailGeometry(pts: FlightDetail["trail"]): TrailGeometry {
  const lines: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  if (!pts.length) return { lines, points, last: null };
  const colorOf = (p: FlightDetail["trail"][number]) => altitudeColor(p[2], p[3] < GROUND_SPEED_KT);
  const line = (coords: [number, number][], props: Record<string, unknown>) =>
    lines.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
  let prevLon = pts[0][0];
  let color = colorOf(pts[0]);
  let coords: [number, number][] = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const lon = i ? unwrap(prevLon, p[0]) : p[0];
    const c = colorOf(p);
    points.push({
      type: "Feature",
      properties: { c, t: p[4], alt: p[2], gs: p[3] },
      geometry: { type: "Point", coordinates: [lon, p[1]] },
    });
    if (i) {
      if (p[4] - pts[i - 1][4] > TRAIL_GAP_S) {
        if (coords.length > 1) line(coords, { c: color });
        line([coords[coords.length - 1], [lon, p[1]]], { gap: 1 });
        coords = [[lon, p[1]]];
      } else {
        coords.push([lon, p[1]]);
        // Colour changes at each point: close the segment there and start the next one
        if (c !== color) {
          line(coords, { c: color });
          coords = [[lon, p[1]]];
        }
      }
    }
    color = c;
    prevLon = lon;
  }
  if (coords.length > 1) line(coords, { c: color });
  return { lines, points, last: { lon: prevLon, lat: pts[pts.length - 1][1], c: color } };
}

interface Props {
  selected: string | null;
  selectedAirport: string | null;
}

export default function LiveMap({ selected, selectedAirport }: Props) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const displayRef = useRef(new Map<string, Display>());
  const selectedRef = useRef(selected);
  const selectedAirportRef = useRef(selectedAirport);
  const detailRef = useRef<FlightDetail | null>(null);
  const airportsRef = useRef<AirportRow[] | null>(null);
  const highlightRef = useRef<string[]>([]);
  const flewToRef = useRef<string | null>(null);
  const forceRef = useRef(0);
  const mapStyle = useStore((s) => s.settings.mapStyle);
  const { data: detail } = useFlightDetail(selected);
  const { data: airports } = useAirportRows();

  selectedRef.current = selected;
  selectedAirportRef.current = selectedAirport?.toUpperCase() ?? null;
  detailRef.current = detail && detail.callsign === selected ? detail : null;
  airportsRef.current = airports;

  // ---- map lifecycle
  useEffect(() => {
    let view = { center: [8, 47] as [number, number], zoom: 4.2 };
    try {
      const v = JSON.parse(localStorage.getItem("fr48:view") || "null");
      if (v?.center && typeof v.zoom === "number") view = v;
    } catch {}
    const map = new maplibregl.Map({
      container: container.current!,
      // Google needs a session first: start on a plain placeholder, then swap in the real style
      style:
        getState().settings.mapStyle === "google"
          ? { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#41707d" } }] }
          : STYLES[getState().settings.mapStyle],
      center: view.center,
      zoom: view.zoom,
      minZoom: 1.5,
      maxZoom: 17,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
    });
    map.touchZoomRotate.disableRotation();
    if (getState().settings.mapStyle === "google") {
      resolveStyle("google").then((st) => {
        if (mapRef.current === map && getState().settings.mapStyle === "google") map.setStyle(st);
      });
    }
    mapRef.current = map;
    mapInstance.current = map;
    if (process.env.NODE_ENV === "development") (window as unknown as { __map: MLMap }).__map = map;

    map.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    map.on("style.load", () => {
      installLayers(map);
      syncNight(map, getState().settings.dayNight, "atc-fir-fill");
      syncRadar(map, getState().settings.weather);
      forceRef.current++;
      refreshAirports();
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      try {
        localStorage.setItem("fr48:view", JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }));
      } catch {}
      forceRef.current++;
    });

    // Hover tooltip
    const tip = document.createElement("div");
    tip.className = "fr-tooltip";
    container.current!.appendChild(tip);
    const selLabel = document.createElement("div");
    selLabel.className = "fr-tooltip fr-tooltip-selected";
    container.current!.appendChild(selLabel);
    let hoverCs: string | null = null;
    const aptLabel = document.createElement("div");
    aptLabel.className = "fr-tooltip fr-airport-label";
    container.current!.appendChild(aptLabel);
    let hoverApt: string | null = null;
    const placeAptLabel = (row: AirportRow, hovered: boolean) => {
      const { x, y } = map.project([row[4], row[3]]);
      if (aptLabel.dataset.icao !== row[0]) {
        aptLabel.innerHTML = airportLabelHtml(row);
        aptLabel.dataset.icao = row[0];
      }
      const pin = pinHeight(map.getZoom()) * (hovered ? 1.25 : 1);
      aptLabel.style.transform = `translate(${x}px, ${y - pin - 10}px) translate(-50%, -100%)`;
      aptLabel.style.opacity = "1";
    };
    // Index airport rows once per data refresh instead of scanning ~4k rows every frame
    let aptIndexFor: AirportRow[] | null = null;
    let aptIndex = new Map<string, AirportRow>();
    const findAirport = (icao: string | null) => {
      if (!icao) return undefined;
      const rows = airportsRef.current;
      if (rows !== aptIndexFor) {
        aptIndexFor = rows;
        aptIndex = new Map((rows ?? []).map((r) => [r[0], r]));
      }
      return aptIndex.get(icao);
    };
    map.on("mousemove", "flights", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { cs: string };
      if (hoverCs !== p.cs) map.setFilter("flights-hover", ["==", ["get", "cs"], p.cs]);
      if (hoverCs !== p.cs) tip.textContent = p.cs;
      hoverCs = p.cs;
      // Position is updated every animation frame so the bubble follows the aircraft
    });
    map.on("mouseleave", "flights", () => {
      map.getCanvas().style.cursor = "";
      tip.style.opacity = "0";
      hoverCs = null;
      map.setFilter("flights-hover", ["==", ["get", "cs"], ""]);
    });
    // Trail dots: recorded time (UTC), speed and altitude
    const pointTip = document.createElement("div");
    pointTip.className = "fr-tooltip fr-trail-tip";
    container.current!.appendChild(pointTip);
    map.on("mousemove", "trail-points-hit", (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const p = f.properties as { t: number; alt: number; gs: number };
      const { altitudeUnit, speedUnit } = getState().settings;
      const time = new Date(p.t * 1000).toISOString().slice(11, 19);
      pointTip.textContent = `${time} UTC · ${fmtSpeed(p.gs, speedUnit)} · ${fmtAltitude(p.alt, altitudeUnit)}`;
      const { x, y } = map.project(f.geometry.coordinates as [number, number]);
      pointTip.style.transform = `translate(${x}px, ${y - 10}px) translate(-50%, -100%)`;
      pointTip.style.opacity = "1";
    });
    map.on("mouseleave", "trail-points-hit", () => {
      pointTip.style.opacity = "0";
    });
    map.on("mousemove", "airports-pin", (e) => {
      const icao = e.features?.[0]?.properties.icao;
      if (!icao) return;
      map.getCanvas().style.cursor = "pointer";
      map.setFilter("airports-pin-hover", ["==", ["get", "icao"], icao]);
      hoverApt = icao;
    });
    map.on("mouseleave", "airports-pin", () => {
      map.getCanvas().style.cursor = "";
      map.setFilter("airports-pin-hover", ["==", ["get", "icao"], ""]);
      hoverApt = null;
    });

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(
        [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ],
        { layers: ["flights", "airports-pin"] },
      );
      const plane = hits.find((h) => h.layer.id === "flights");
      const apt = hits.find((h) => h.layer.id === "airports-pin");
      // Online ATC: airport badge first; areas only when no panel needs closing
      const atcHits = getState().settings.atc ? map.queryRenderedFeatures(e.point, { layers: ATC_CLICK_LAYERS.filter((l) => map.getLayer(l)) }) : [];
      const atcBadge = atcHits.find((h) => h.layer.id === "atc-apt");
      const atcArea = atcHits.find((h) => h.layer.id !== "atc-apt");
      const showAtc = (key: string) => {
        const html = atcPopupHtml(key);
        if (html) new maplibregl.Popup({ maxWidth: "320px", className: "fr-atc-popup" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      // In 3D the pointer orbits the camera; don't treat taps as map clicks
      if (getState().view3d) return;
      if (plane) {
        flewToRef.current = plane.properties.cs;
        router.push(`/${encodeURIComponent(plane.properties.cs)}`);
      } else if (apt) router.push(`/airport/${apt.properties.icao}`);
      else if (atcBadge) showAtc(atcBadge.properties.key);
      else if (selectedRef.current || window.location.pathname !== "/") router.push("/");
      else if (atcArea) showAtc(atcArea.properties.key);
    });

    // ---- animation loop: dead-reckon every aircraft between feed updates
    let raf = 0;
    let trailCache: { det: FlightDetail | null; count: number; src: GeoJSONSource | undefined; geo: TrailGeometry } = {
      det: null, count: 0, src: undefined, geo: { lines: [], points: [], last: null },
    };
    let lastPush = 0;
    let lastForce = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const st = getState();
      const selCs = selectedRef.current;
      const selNow = selCs ? displayRef.current.get(selCs) : undefined;
      if (selNow && !st.view3d) {
        const { x, y } = map.project([selNow.lon, selNow.lat]);
        selLabel.textContent = selCs;
        selLabel.style.transform = `translate(${x}px, ${y - 22}px) translate(-50%, -100%)`;
        selLabel.style.opacity = "1";
      } else selLabel.style.opacity = "0";
      const hoverNow = hoverCs && hoverCs !== selCs ? displayRef.current.get(hoverCs) : undefined;
      if (hoverNow) {
        const { x, y } = map.project([hoverNow.lon, hoverNow.lat]);
        tip.style.transform = `translate(${x}px, ${y - 22}px) translate(-50%, -100%)`;
        tip.style.opacity = "1";
      } else if (tip.style.opacity !== "0") tip.style.opacity = "0";
      const aptIcao = hoverApt ?? selectedAirportRef.current;
      const aptRow = aptIcao ? findAirport(aptIcao) : undefined;
      if (aptRow) placeAptLabel(aptRow, aptIcao === hoverApt);
      else if (aptLabel.style.opacity !== "0") aptLabel.style.opacity = "0";
      const src = map.getSource("flights") as GeoJSONSource | undefined;
      const rows = st.data?.flights;
      if (!rows || !src) return;

      const zoom = map.getZoom();
      const interval = zoom < 4 ? 2000 : zoom < 6 ? 1000 : zoom < 8 ? 250 : 80;
      if (now - lastPush < interval && lastForce === forceRef.current) return;
      lastPush = now;
      lastForce = forceRef.current;

      // Smooth path between feed snapshots, drawn a little behind real time
      const tr = renderTime();
      const sel = selCs;
      const display = displayRef.current;
      const bounds = map.getBounds();
      const pad = 3;
      const inView = (lat: number, lon: number) => {
        if (zoom < 5) return true;
        if (lat < bounds.getSouth() - pad || lat > bounds.getNorth() + pad) return false;
        const w = bounds.getWest() - pad, e2 = bounds.getEast() + pad;
        const l = unwrap((w + e2) / 2, lon);
        return l >= w && l <= e2;
      };
      const k = st.settings.iconSize;
      const labels = st.settings.labels && zoom >= 6;
      const features: GeoJSON.Feature[] = [];
      const seen = new Set<string>();

      for (const f of rows) {
        const [cs, lat, lon, hdg, alt, , type, dep, arr, squawk, , ground, rowSil] = f;
        const sil: Silhouette = cs.startsWith("SANTA") ? "santa" : (rowSil as Silhouette);
        const isSel = cs === sel;
        if (!isSel && !matches(f, st.filters)) continue;
        seen.add(cs);
        const m = motionAt(cs, tr);
        const d: Display = m ? { lat: m.lat, lon: m.lon, hdg: m.hdg } : { lat, lon, hdg };
        display.set(cs, d);
        if (!isSel && !inView(d.lat, d.lon)) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.lon, d.lat] },
          properties: {
            cs,
            s: sil,
            h: d.hdg,
            sel: isSel ? 1 : 0,
            emg: EMERGENCY_SQUAWKS.has(squawk) ? 1 : 0,
            k: (SILHOUETTE_SCALE[sil] ?? 1) * (isSel ? k * 1.1 : k),
            t: type,
            r: dep && arr ? `${dep} → ${arr}` : "",
            lbl: labels && !isSel ? cs : "",
            g: ground,
            a: alt,
          },
        });
      }
      for (const key of display.keys()) if (!seen.has(key)) display.delete(key);
      src.setData({ type: "FeatureCollection", features });

      // Selected flight: trail, route and follow
      const det = detailRef.current;
      const live = sel ? display.get(sel) : undefined;
      const trailSrc = map.getSource("trail") as GeoJSONSource | undefined;
      const liveSrc = map.getSource("trail-live") as GeoJSONSource | undefined;
      const pointSrc = map.getSource("trail-points") as GeoJSONSource | undefined;
      const routeSrc = map.getSource("route") as GeoJSONSource | undefined;
      const gapSrc = map.getSource("trail-gap") as GeoJSONSource | undefined;
      if (det && trailSrc && routeSrc) {
        // Aircraft are drawn slightly in the past: don't let the trail run ahead of the icon.
        // The recorded part only changes when a point is passed; the segment to the icon every frame.
        const n = det.trail.findIndex((p) => p[4] > tr);
        const count = n < 0 ? det.trail.length : n;
        if (trailCache.det !== det || trailCache.count !== count || trailCache.src !== trailSrc) {
          trailCache = { det, count, src: trailSrc, geo: trailGeometry(det.trail.slice(0, count)) };
          trailSrc.setData({ type: "FeatureCollection", features: trailCache.geo.lines });
          pointSrc?.setData({ type: "FeatureCollection", features: trailCache.geo.points });
        }
        const last = trailCache.geo.last;
        liveSrc?.setData(
          last && live
            ? { type: "Feature", properties: { c: last.c }, geometry: { type: "LineString", coordinates: [[last.lon, last.lat], [unwrap(last.lon, live.lon), live.lat]] } }
            : EMPTY,
        );
        // Trail starts away from the departure airport: draw the unknown part as estimated
        const known = det.trail.filter((p) => p[4] <= tr);
        const first = known[0] ? { lon: known[0][0], lat: known[0][1] } : live;
        const org = det.origin;
        const tookOffUnseen = det.times.actualDeparture === null || (known[0] && known[0][4] - det.times.actualDeparture > 300);
        gapSrc?.setData(
          org && first && !det.position.onGround && tookOffUnseen && distanceNm(org.lat, org.lon, first.lat, first.lon) > 15
            ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: greatCircle(org.lat, org.lon, first.lat, first.lon) } }
            : EMPTY,
        );
        const dest = det.destination;
        routeSrc.setData(
          live && dest && det.status !== "landed" && getState().showRoute
            ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: greatCircle(live.lat, live.lon, dest.lat, dest.lon) } }
            : EMPTY,
        );
      } else {
        trailSrc?.setData(EMPTY);
        liveSrc?.setData(EMPTY);
        pointSrc?.setData(EMPTY);
        trailCache = { det: null, count: 0, src: undefined, geo: { lines: [], points: [], last: null } };
        routeSrc?.setData(EMPTY);
        gapSrc?.setData(EMPTY);
      }
      if (live && getState().follow && !st.view3d && !map.isMoving()) map.jumpTo({ center: [live.lon, live.lat] });
      if (!st.view3d && sel && live && flewToRef.current !== sel) {
        flewToRef.current = sel;
        if (!map.getBounds().contains([live.lon, live.lat])) {
          map.flyTo({ center: [live.lon, live.lat], zoom: Math.max(map.getZoom(), 6), duration: 1200 });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    const unsub = subscribe(() => forceRef.current++);

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      map.remove();
      mapRef.current = null;
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 3D chase view of the selected live flight
  const view3d = useStore((s) => s.view3d);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !view3d || !selected) return;
    let v: View3D | null = null;
    let cancelled = false;
    // Follow the selected aircraft along the same smooth path as the 2D map
    const target = () => {
      const cs = selectedRef.current;
      const row = cs ? getState().data?.flights.find((f) => f[0] === cs) : undefined;
      const m = cs ? motionAt(cs, renderTime()) : null;
      if (!row || !m) return null;
      return { lat: m.lat, lon: m.lon, altFt: m.alt, hdg: m.hdg, vsFpm: row[10], gs: m.gs };
    };
    import("./view3d").then(({ View3D }) => {
      if (cancelled) return;
      v = new View3D(map, target);
      v.start();
    });
    // Leaving the style (map style switch) ends the 3D view
    const onStyle = () => setState({ view3d: false });
    map.once("style.load", onStyle);
    return () => {
      cancelled = true;
      map.off("style.load", onStyle);
      v?.stop();
    };
  }, [view3d, selected]);
  // Deselecting or switching flight leaves 3D
  useEffect(() => {
    if (!selected && getState().view3d) setState({ view3d: false });
  }, [selected]);

  // ---- online ATC, refreshed every minute while enabled
  const atcOn = useStore((s) => s.settings.atc);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const run = () => {
      const m = mapRef.current;
      if (m?.isStyleLoaded() && !document.hidden) syncAtc(m, getState().settings.atc);
    };
    if (map.isStyleLoaded()) syncAtc(map, atcOn);
    else map.once("idle", run);
    if (!atcOn) return;
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [atcOn]);

  // ---- day/night shading, redrawn every minute
  const dayNight = useStore((s) => s.settings.dayNight);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) syncNight(map, dayNight, "atc-fir-fill");
    if (!dayNight) return;
    const t = setInterval(() => {
      const m = mapRef.current;
      if (m?.isStyleLoaded() && !document.hidden) syncNight(m, true, "atc-fir-fill");
    }, 60_000);
    return () => clearInterval(t);
  }, [dayNight]);

  // ---- weather radar toggle
  const weather = useStore((s) => s.settings.weather);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) syncRadar(map, weather);
  }, [weather]);

  // ---- style switching
  const styleRef = useRef(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;
    resolveStyle(mapStyle).then((st) => {
      if (mapRef.current === map && styleRef.current === mapStyle) map.setStyle(st);
    });
  }, [mapStyle]);

  // ---- airports layer
  function refreshAirports() {
    const map = mapRef.current;
    const src = map?.getSource("airports") as GeoJSONSource | undefined;
    const rows = airportsRef.current;
    if (!src || !rows) return;
    const showAll = getState().settings.airports;
    const hl = new Set(highlightRef.current);
    src.setData({
      type: "FeatureCollection",
      features: rows
        .filter((r) => showAll || hl.has(r[0]))
        .map(([icao, iata, name, lat, lon, size, arrs, deps]) => {
          const traffic = arrs + deps;
          const minz = size >= 4 ? 3 : size >= 3 ? 5 : traffic > 0 ? 6.5 : 8;
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: { icao, code: iata || icao, name, minz: Math.max(2, minz - Math.min(2, traffic / 15)), hl: hl.has(icao) ? 1 : 0 },
          };
        }),
    });
  }

  const showAirports = useStore((s) => s.settings.airports);
  useEffect(() => {
    const hl: string[] = [];
    if (detail && detail.callsign === selected) {
      if (detail.origin) hl.push(detail.origin.icao);
      if (detail.destination) hl.push(detail.destination.icao);
    }
    if (selectedAirport) hl.push(selectedAirport.toUpperCase());
    highlightRef.current = hl;
    refreshAirports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airports, detail?.origin?.icao, detail?.destination?.icao, selected, selectedAirport, showAirports]);

  // Fly to a selected airport
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAirport || !airports) return;
    const row = airports.find((r) => r[0] === selectedAirport.toUpperCase());
    if (row) map.flyTo({ center: [row[4], row[3]], zoom: Math.max(map.getZoom(), 8), duration: 1200 });
  }, [selectedAirport, airports]);

  // Clear follow when deselecting
  useEffect(() => {
    if (!selected && getState().follow) setState({ follow: false });
    forceRef.current++;
  }, [selected]);

  // MapLibre forces `position: relative` on its container, so size it from a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      <GoogleAttribution active={mapStyle === "google"} />
    </div>
  );
}
