"use client";

import { useSyncExternalStore } from "react";
import type { FlightsResponse } from "../types";

export type MapStyle = "light" | "dark" | "voyager" | "satellite";

export interface Settings {
  mapStyle: MapStyle;
  labels: boolean;
  airports: boolean;
  iconSize: number;
  altitudeUnit: "ft" | "m";
  speedUnit: "kt" | "kmh" | "mph";
  distanceUnit: "nm" | "km" | "mi";
  timeZone: "utc" | "local";
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
  mapStyle: "light",
  labels: false,
  airports: true,
  iconSize: 1,
  altitudeUnit: "ft",
  speedUnit: "kt",
  distanceUnit: "nm",
  timeZone: "utc",
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
};
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = { ...state, settings: load("fr48:settings", DEFAULT_SETTINGS), filters: load("fr48:filters", DEFAULT_FILTERS) };
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
