"use client";

import { useSyncExternalStore } from "react";
import type { FlightsResponse } from "../types";

export type MapStyle = "fr24" | "light" | "dark" | "voyager" | "satellite";

export interface Settings {
  mapStyle: MapStyle;
  labels: boolean;
  airports: boolean;
  iconSize: number;
  altitudeUnit: "ft" | "m";
  speedUnit: "kt" | "kmh" | "mph";
  distanceUnit: "nm" | "km" | "mi";
  timeZone: "utc" | "local";
  weather: boolean;
  dayNight: boolean;
  widgets: { tracked: boolean; airports: boolean; bookmarks: boolean };
}

export interface Bookmark {
  kind: "flight" | "airport";
  id: string;
  label: string;
  sub?: string;
}

export interface Filters {
  airline: string;
  aircraft: string;
  airport: string;
  callsign: string;
  altMin: number;
  altMax: number;
  ground: "all" | "air" | "ground";
}

export const DEFAULT_SETTINGS: Settings = {
  mapStyle: "fr24",
  labels: false,
  airports: true,
  iconSize: 1,
  altitudeUnit: "ft",
  speedUnit: "kt",
  distanceUnit: "nm",
  timeZone: "utc",
  weather: false,
  dayNight: true,
  widgets: { tracked: true, airports: true, bookmarks: true },
};

export const DEFAULT_FILTERS: Filters = {
  airline: "",
  aircraft: "",
  airport: "",
  callsign: "",
  altMin: 0,
  altMax: 60000,
  ground: "all",
};

interface State {
  data: FlightsResponse | null;
  /** Client clock (ms) when `data` arrived, used for dead-reckoning. */
  receivedAt: number;
  error: boolean;
  settings: Settings;
  filters: Filters;
  follow: boolean;
  panel: null | "settings" | "filters" | "widgets";
  bookmarks: Bookmark[];
}

const load = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
};

let state: State = {
  data: null,
  receivedAt: 0,
  error: false,
  settings: DEFAULT_SETTINGS,
  filters: DEFAULT_FILTERS,
  follow: false,
  panel: null,
  bookmarks: [],
};
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const settings = load("fr48:settings", DEFAULT_SETTINGS);
  settings.widgets = { ...DEFAULT_SETTINGS.widgets, ...settings.widgets };
  let bookmarks: Bookmark[] = [];
  try {
    bookmarks = JSON.parse(localStorage.getItem("fr48:bookmarks") || "[]");
  } catch {}
  state = { ...state, settings, filters: load("fr48:filters", DEFAULT_FILTERS), bookmarks };
}

export function getState(): State {
  hydrate();
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  hydrate();
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  try {
    if (p.settings) localStorage.setItem("fr48:settings", JSON.stringify(state.settings));
    if (p.filters) localStorage.setItem("fr48:filters", JSON.stringify(state.filters));
    if (p.bookmarks) localStorage.setItem("fr48:bookmarks", JSON.stringify(state.bookmarks));
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverState = state;
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(getState()), () => select(serverState));
}

export const updateSettings = (p: Partial<Settings>) => setState((s) => ({ settings: { ...s.settings, ...p } }));
export const updateFilters = (p: Partial<Filters>) => setState((s) => ({ filters: { ...s.filters, ...p } }));

export function toggleBookmark(b: Bookmark) {
  setState((s) => {
    const exists = s.bookmarks.some((x) => x.kind === b.kind && x.id === b.id);
    return { bookmarks: exists ? s.bookmarks.filter((x) => !(x.kind === b.kind && x.id === b.id)) : [...s.bookmarks, b] };
  });
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.airline) n++;
  if (f.aircraft) n++;
  if (f.airport) n++;
  if (f.callsign) n++;
  if (f.altMin > 0 || f.altMax < 60000) n++;
  if (f.ground !== "all") n++;
  return n;
}
