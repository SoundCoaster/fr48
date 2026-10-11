import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { MapStyle } from "@/lib/client/store";

const CARTO = "https://basemaps.cartocdn.com/gl";
const GLYPHS = "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf";
const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_PHYSICAL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}";
/** Ocean colour sampled from Flightradar24's default map. */
const FR24_WATER = "#41707d";
const FONT_MEDIUM = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"];
const FONT_REGULAR = ["Montserrat Regular", "Open Sans Regular", "Noto Sans Regular"];
const NAME: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name"]];

/**
 * Flightradar24-like default. FR24 uses a darkened Google terrain map; we get
 * the same palette (green lowlands, tan deserts, shaded relief, teal oceans)
 * from Esri's physical map, darkened with raster settings fitted to colours
 * sampled from FR24. It stops at zoom 8, where darkened imagery takes over.
 */
const fr24: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    physical: {
      type: "raster",
      tiles: [ESRI_PHYSICAL],
      tileSize: 256,
      maxzoom: 8,
      attribution: "Esri, US National Park Service",
    },
    imagery: {
      type: "raster",
      tiles: [ESRI_IMAGERY],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    carto: {
      type: "vector",
      url: "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": FR24_WATER } },
    {
      id: "physical",
      type: "raster",
      source: "physical",
      maxzoom: 10,
      paint: {
        "raster-brightness-max": 0.55,
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 9.5, 0],
        "raster-fade-duration": 0,
      },
    },
    {
      id: "imagery",
      type: "raster",
      source: "imagery",
      minzoom: 8,
      paint: {
        "raster-brightness-max": 0.62,
        "raster-brightness-min": 0.06,
        "raster-saturation": -0.3,
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 9.5, 1],
      },
    },
    {
      // Pull the oceans towards FR24's teal
      id: "water-tint",
      type: "fill",
      source: "carto",
      "source-layer": "water",
      paint: { "fill-color": FR24_WATER, "fill-opacity": 0.45, "fill-antialias": false },
    },
    {
      id: "boundary-state",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 5,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["==", ["get", "maritime"], 0]],
      paint: { "line-color": "rgba(10,10,10,0.45)", "line-width": 0.8, "line-dasharray": [3, 2] },
    },
    {
      id: "boundary-country",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "maritime"], 0]],
      paint: { "line-color": "#0b0b0b", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.6, 10, 2.2] },
    },
    {
      id: "water-name",
      type: "symbol",
      source: "carto",
      "source-layer": "water_name",
      filter: ["in", ["get", "class"], ["literal", ["ocean", "sea"]]],
      layout: { "text-field": NAME, "text-font": ["Montserrat Regular Italic", "Open Sans Italic"], "text-size": 13 },
      paint: { "text-color": "rgba(150,170,185,0.75)" },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 7,
      filter: ["==", ["get", "class"], "town"],
      layout: { "text-field": NAME, "text-font": FONT_REGULAR, "text-size": 12 },
      paint: { "text-color": "#1c1c1c", "text-halo-color": "rgba(220,225,228,0.7)", "text-halo-width": 1.2 },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 4,
      filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["get", "rank"], 8]],
      layout: {
        "text-field": NAME,
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 15],
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": "#171717", "text-halo-color": "rgba(225,230,232,0.75)", "text-halo-width": 1.3 },
    },
    {
      id: "place-country",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      maxzoom: 8,
      filter: ["==", ["get", "class"], "country"],
      layout: { "text-field": NAME, "text-font": FONT_MEDIUM, "text-size": ["interpolate", ["linear"], ["zoom"], 2, 12, 6, 20] },
      paint: { "text-color": "#141414", "text-halo-color": "rgba(220,225,228,0.7)", "text-halo-width": 1.4 },
    },
  ],
};

const satellite: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    esri: { type: "raster", tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
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
};

export const STYLES: Record<MapStyle, string | StyleSpecification> = {
  fr24,
  light: `${CARTO}/positron-gl-style/style.json`,
  dark: `${CARTO}/dark-matter-gl-style/style.json`,
  voyager: `${CARTO}/voyager-gl-style/style.json`,
  satellite,
};

export const STYLE_LABELS: Record<MapStyle, string> = {
  fr24: "Map",
  satellite: "Satellite",
  dark: "Dark",
  light: "Light",
  voyager: "Voyager",
};

export const isDarkStyle = (s: MapStyle) => s !== "light" && s !== "voyager";
