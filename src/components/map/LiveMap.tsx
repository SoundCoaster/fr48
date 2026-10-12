"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, SymbolLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SILHOUETTE_SCALE, SILHOUETTES, type Silhouette } from "@/data/aircraft";
import { mapInstance } from "./instance";
import { sampleAt, trailAt } from "@/lib/client/playback";
import type { View3D } from "./view3d";
import { syncNight } from "./daynight";
import { GoogleAttribution } from "./GoogleAttribution";
import { isDarkStyle, resolveStyle, STYLES } from "./styles";
import { useAirportRows, useFlightDetail, type AirportRow } from "@/lib/client/data";
import { getState, setState, subscribe, useStore, type Filters } from "@/lib/client/store";
import { altitudeColor } from "@/lib/format";
import { destination, distanceNm, greatCircle, unwrap } from "@/lib/geo";
import type { FlightDetail, FlightRow } from "@/lib/types";

// Bundlers break MapLibre's self-located worker; serve it from /public instead (see postinstall).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

/** Aircraft PNGs are 128 px; at icon-size 1 they render as a 44 px slot. */
const PLANE_RATIO = 128 / 44;
/** Airport pins are 112 px tall; at icon-size 1 they render 28 px tall. */
const PIN_RATIO = 4;

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
  map.addLayer({
    id: "trail",
    type: "line",
    source: "trail",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "c"], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 10, 4] },
  });
  const pinLayout = {
    "icon-anchor": "bottom",
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.36, 6, 0.5, 10, 0.75, 14, 1],
    "icon-allow-overlap": true,
    "text-field": ["get", "code"],
    "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
    "text-size": 11,
    "text-offset": [0, 0.25],
    "text-anchor": "top",
    "text-optional": true,
  } satisfies SymbolLayerSpecification["layout"];
  const pinPaint = {
    "text-color": isDark ? "#e8edf2" : "#24313d",
    "text-halo-color": isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)",
    "text-halo-width": 1.4,
  };
  map.addLayer({
    id: "airports-pin",
    type: "symbol",
    source: "airports",
    filter: ["any", ["==", ["get", "hl"], 1], [">=", ["zoom"], ["get", "minz"]]],
    layout: {
      ...pinLayout,
      "icon-image": ["case", ["==", ["get", "hl"], 1], "airport-hover", "airport"],
      "symbol-sort-key": ["get", "hl"],
      // Codes only once zoomed in a bit further than the pin itself
      "text-field": ["step", ["zoom"], "", 8, ["get", "code"]],
    },
    paint: pinPaint,
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
    paint: pinPaint,
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
      "icon-image": ["concat", "plane-", ["get", "s"], ["case", ["==", ["get", "sel"], 1], "-sel", ""]],
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

function trailFeatures(detail: FlightDetail, live: Display | undefined): GeoJSON.Feature[] {
  const pts = detail.trail;
  const feats: GeoJSON.Feature[] = [];
  if (!pts.length) return feats;
  let color = altitudeColor(pts[0][2]);
  let prevLon = pts[0][0];
  let coords: [number, number][] = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    const lon = unwrap(prevLon, pts[i][0]);
    prevLon = lon;
    coords.push([lon, pts[i][1]]);
    const c = altitudeColor(pts[i][2]);
    if (c !== color) {
      feats.push({ type: "Feature", properties: { c: color }, geometry: { type: "LineString", coordinates: coords } });
      coords = [[lon, pts[i][1]]];
      color = c;
    }
  }
  if (live) coords.push([unwrap(prevLon, live.lon), live.lat]);
  if (coords.length > 1) feats.push({ type: "Feature", properties: { c: color }, geometry: { type: "LineString", coordinates: coords } });
  return feats;
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
      syncNight(map, getState().settings.dayNight, "route");
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
      // In 3D the pointer orbits the camera; don't treat taps as map clicks
      if (getState().view3d) return;
      if (getState().playback) {
        // Playback: select locally (the flight may no longer be online)
        if (plane) setState({ playbackSel: plane.properties.cs });
        else if (apt) router.push(`/airport/${apt.properties.icao}`);
        else setState({ playbackSel: null });
        return;
      }
      if (plane) {
        flewToRef.current = plane.properties.cs;
        router.push(`/${encodeURIComponent(plane.properties.cs)}`);
      } else if (apt) router.push(`/airport/${apt.properties.icao}`);
      else if (selectedRef.current || window.location.pathname !== "/") router.push("/");
    });

    // ---- animation loop: dead-reckon every aircraft between feed updates
    let raf = 0;
    let lastFrame = performance.now();
    let lastPush = 0;
    let lastForce = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(1, (now - lastFrame) / 1000);
      lastFrame = now;
      const st = getState();
      const pb = st.playback;
      // In playback the selection is local, not the routed live flight
      const selCs = pb ? st.playbackSel : selectedRef.current;
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
      const rows = pb ? sampleAt(pb.t) : st.data?.flights;
      if (!rows || !src) return;

      const zoom = map.getZoom();
      const interval = zoom < 4 ? 2000 : zoom < 6 ? 1000 : zoom < 8 ? 250 : 80;
      if (now - lastPush < interval && lastForce === forceRef.current) return;
      const elapsedPush = (now - lastPush) / 1000;
      lastPush = now;
      lastForce = forceRef.current;

      // Live: dead-reckon from the feed time. Playback rows are already interpolated.
      const age0 = !pb && st.data ? (st.data.serverTime - Date.parse(st.data.updated)) / 1000 : 0;
      const elapsed = pb ? 0 : Math.min(90, Math.max(0, age0 + (Date.now() - st.receivedAt) / 1000));
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
      const smoothing = 1 - Math.exp(-Math.max(dt, elapsedPush) * 3);
      const k = st.settings.iconSize;
      const labels = st.settings.labels && zoom >= 6;
      const features: GeoJSON.Feature[] = [];
      const seen = new Set<string>();

      for (const f of rows) {
        const [cs, lat, lon, hdg, alt, gs, type, dep, arr, , , ground, rowSil] = f;
        const sil: Silhouette = cs.startsWith("SANTA") ? "santa" : (rowSil as Silhouette);
        const isSel = cs === sel;
        if (!isSel && !matches(f, st.filters)) continue;
        seen.add(cs);
        const [tLat, tLon] = gs > 5 ? destination(lat, lon, hdg, (gs * elapsed) / 3600) : [lat, lon];
        let d = display.get(cs);
        if (pb || !d || distanceNm(d.lat, d.lon, tLat, tLon) > 8) {
          d = { lat: tLat, lon: tLon, hdg };
          display.set(cs, d);
        } else {
          d.lat += (tLat - d.lat) * smoothing;
          d.lon += (unwrap(d.lon, tLon) - d.lon) * smoothing;
          d.hdg = hdg;
        }
        if (!isSel && !inView(d.lat, d.lon)) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.lon, d.lat] },
          properties: {
            cs,
            s: sil,
            h: hdg,
            sel: isSel ? 1 : 0,
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
      const routeSrc = map.getSource("route") as GeoJSONSource | undefined;
      if (pb) {
        // Replayed track from the recorded frames
        const pts = sel ? trailAt(sel, pb.t) : [];
        const fake = { trail: pts.map(([lon, lat, alt]) => [lon, lat, alt, 0, 0]) } as unknown as FlightDetail;
        trailSrc?.setData({ type: "FeatureCollection", features: pts.length ? trailFeatures(fake, live) : [] });
        routeSrc?.setData(EMPTY);
      } else if (det && trailSrc && routeSrc) {
        trailSrc.setData({ type: "FeatureCollection", features: trailFeatures(det, live) });
        const dest = det.destination;
        routeSrc.setData(
          live && dest && det.status !== "landed" && getState().showRoute
            ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: greatCircle(live.lat, live.lon, dest.lat, dest.lon) } }
            : EMPTY,
        );
      } else {
        trailSrc?.setData(EMPTY);
        routeSrc?.setData(EMPTY);
      }
      if (live && getState().follow && !st.view3d && !map.isMoving()) map.jumpTo({ center: [live.lon, live.lat] });
      if (!pb && !st.view3d && sel && live && flewToRef.current !== sel) {
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
    // Follow the selected aircraft, dead-reckoned from the latest feed row
    const target = () => {
      const st = getState();
      const row = st.data?.flights.find((f) => f[0] === selectedRef.current);
      if (!row || !st.data) return null;
      const [, lat, lon, hdg, alt, gs, , , , , vs] = row;
      const age = (st.data.serverTime - Date.parse(st.data.updated)) / 1000 + (Date.now() - st.receivedAt) / 1000;
      const [la, lo] = gs > 5 ? destination(lat, lon, hdg, (gs * Math.min(90, Math.max(0, age))) / 3600) : [lat, lon];
      return { lat: la, lon: lo, altFt: alt + (vs * Math.min(90, Math.max(0, age))) / 60, hdg, vsFpm: vs, gs };
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

  // ---- day/night shading, redrawn every minute
  const dayNight = useStore((s) => s.settings.dayNight);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) syncNight(map, dayNight, "route");
    if (!dayNight) return;
    const t = setInterval(() => {
      const m = mapRef.current;
      if (m?.isStyleLoaded() && !document.hidden) syncNight(m, true, "route");
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
