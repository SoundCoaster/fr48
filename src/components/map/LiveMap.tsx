"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Silhouette } from "@/data/aircraft";
import { mapInstance } from "./instance";
import { useAirportRows, useFlightDetail, type AirportRow } from "@/lib/client/data";
import { getState, setState, subscribe, useStore, type Filters, type MapStyle } from "@/lib/client/store";
import { altitudeColor } from "@/lib/format";
import { destination, distanceNm, greatCircle, unwrap } from "@/lib/geo";
import { SILHOUETTES, silhouettePath, silhouetteScale } from "@/lib/silhouettes";
import type { FlightDetail, FlightRow } from "@/lib/types";

// Bundlers break MapLibre's self-located worker; serve it from /public instead (see postinstall).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const CARTO = "https://basemaps.cartocdn.com/gl";
const STYLES: Record<MapStyle, string | StyleSpecification> = {
  light: `${CARTO}/positron-gl-style/style.json`,
  dark: `${CARTO}/dark-matter-gl-style/style.json`,
  voyager: `${CARTO}/voyager-gl-style/style.json`,
  satellite: {
    version: 8,
    glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
    sources: {
      esri: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 18,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
      labels: {
        type: "raster",
        tiles: ["https://basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}@2x.png"],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "esri", type: "raster", source: "esri" },
      { id: "labels", type: "raster", source: "labels" },
    ],
  },
};

export const PLANE_FILL = "#fdc307";
export const PLANE_STROKE = "#3d3000";
export const PLANE_SELECTED = "#ff3b2f";
const ICON_PX = 44;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Display {
  lat: number;
  lon: number;
  hdg: number;
}

/** Rasterise every silhouette in normal and selected colours for MapLibre. */
function addPlaneImages(map: MLMap) {
  const ratio = 2;
  const size = ICON_PX * ratio;
  for (const s of SILHOUETTES) {
    const path = new Path2D(silhouettePath(s));
    for (const [suffix, fill, stroke] of [
      ["", PLANE_FILL, PLANE_STROKE],
      ["-sel", PLANE_SELECTED, "#5a0b05"],
    ] as const) {
      const id = `plane-${s}${suffix}`;
      if (map.hasImage(id)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const k = (size / 100) * silhouetteScale(s) * 0.82;
      ctx.translate(size / 2, size / 2);
      ctx.scale(k, k);
      ctx.translate(-50, -50);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 3 / k;
      ctx.fillStyle = fill;
      ctx.fill(path);
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 2.6 / k;
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
      ctx.stroke(path);
      ctx.fill(path);
      map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: ratio });
    }
  }
}

function installLayers(map: MLMap) {
  addPlaneImages(map);
  const isDark = getState().settings.mapStyle !== "light" && getState().settings.mapStyle !== "voyager";

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
  map.addLayer({
    id: "airports-dot",
    type: "circle",
    source: "airports",
    filter: ["any", ["==", ["get", "hl"], 1], [">=", ["zoom"], ["get", "minz"]]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 5],
      "circle-color": ["case", ["==", ["get", "hl"], 1], "#1f2c39", "#ffffff"],
      "circle-stroke-color": ["case", ["==", ["get", "hl"], 1], "#ffffff", "#5b6a78"],
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "airports-label",
    type: "symbol",
    source: "airports",
    filter: ["any", ["==", ["get", "hl"], 1], [">=", ["zoom"], ["+", ["get", "minz"], 1.5]]],
    layout: {
      "text-field": ["get", "code"],
      "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": isDark ? "#e8edf2" : "#24313d",
      "text-halo-color": isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)",
      "text-halo-width": 1.4,
    },
  });
  map.addLayer({
    id: "flights",
    type: "symbol",
    source: "flights",
    layout: {
      "icon-image": ["concat", "plane-", ["get", "s"], ["case", ["==", ["get", "sel"], 1], "-sel", ""]],
      "icon-rotate": ["get", "h"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        1, ["*", 0.4, ["get", "k"]],
        4, ["*", 0.55, ["get", "k"]],
        7, ["*", 0.72, ["get", "k"]],
        11, ["*", 0.92, ["get", "k"]],
        15, ["*", 1.2, ["get", "k"]],
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
  const detailRef = useRef<FlightDetail | null>(null);
  const airportsRef = useRef<AirportRow[] | null>(null);
  const highlightRef = useRef<string[]>([]);
  const flewToRef = useRef<string | null>(null);
  const forceRef = useRef(0);
  const mapStyle = useStore((s) => s.settings.mapStyle);
  const { data: detail } = useFlightDetail(selected);
  const { data: airports } = useAirportRows();

  selectedRef.current = selected;
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
      style: STYLES[getState().settings.mapStyle],
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
    mapRef.current = map;
    mapInstance.current = map;
    if (process.env.NODE_ENV === "development") (window as unknown as { __map: MLMap }).__map = map;

    map.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    map.on("style.load", () => {
      installLayers(map);
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
    map.on("mousemove", "flights", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { cs: string; t: string; r: string };
      tip.innerHTML = `<b>${p.cs}</b>${p.t ? ` <span>${p.t}</span>` : ""}${p.r ? `<em>${p.r}</em>` : ""}`;
      tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y - 12}px)`;
      tip.style.opacity = "1";
    });
    map.on("mouseleave", "flights", () => {
      map.getCanvas().style.cursor = "";
      tip.style.opacity = "0";
    });
    map.on("mouseenter", "airports-dot", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "airports-dot", () => (map.getCanvas().style.cursor = ""));

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(
        [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ],
        { layers: ["flights", "airports-dot"] },
      );
      const plane = hits.find((h) => h.layer.id === "flights");
      const apt = hits.find((h) => h.layer.id === "airports-dot");
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
      const src = map.getSource("flights") as GeoJSONSource | undefined;
      if (!st.data || !src) return;

      const zoom = map.getZoom();
      const interval = zoom < 4 ? 2000 : zoom < 6 ? 1000 : zoom < 8 ? 250 : 80;
      if (now - lastPush < interval && lastForce === forceRef.current) return;
      const elapsedPush = (now - lastPush) / 1000;
      lastPush = now;
      lastForce = forceRef.current;

      const age0 = (st.data.serverTime - Date.parse(st.data.updated)) / 1000;
      const elapsed = Math.min(90, Math.max(0, age0 + (Date.now() - st.receivedAt) / 1000));
      const sel = selectedRef.current;
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

      for (const f of st.data.flights) {
        const [cs, lat, lon, hdg, alt, gs, type, dep, arr, , , ground, sil] = f;
        const isSel = cs === sel;
        if (!isSel && !matches(f, st.filters)) continue;
        seen.add(cs);
        const [tLat, tLon] = gs > 5 ? destination(lat, lon, hdg, (gs * elapsed) / 3600) : [lat, lon];
        let d = display.get(cs);
        if (!d || distanceNm(d.lat, d.lon, tLat, tLon) > 8) {
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
            s: sil as Silhouette,
            h: hdg,
            sel: isSel ? 1 : 0,
            k: isSel ? k * 1.12 : k,
            t: type,
            r: dep && arr ? `${dep} → ${arr}` : "",
            lbl: labels || isSel ? cs : "",
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
      if (det && trailSrc && routeSrc) {
        trailSrc.setData({ type: "FeatureCollection", features: trailFeatures(det, live) });
        const dest = det.destination;
        routeSrc.setData(
          live && dest && det.status !== "landed"
            ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: greatCircle(live.lat, live.lon, dest.lat, dest.lon) } }
            : EMPTY,
        );
      } else {
        trailSrc?.setData(EMPTY);
        routeSrc?.setData(EMPTY);
      }
      if (live && getState().follow && !map.isMoving()) map.jumpTo({ center: [live.lon, live.lat] });
      if (sel && live && flewToRef.current !== sel) {
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

  // ---- style switching
  const styleRef = useRef(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;
    map.setStyle(STYLES[mapStyle]);
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
    </div>
  );
}
