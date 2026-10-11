"use client";

import { useEffect, useState } from "react";
import type { AirportDetail, FlightDetail, FlightsResponse } from "../types";
import { setState } from "./store";

/** Polls the live flight list into the global store. */
export function useLiveFlights(intervalMs = 7500) {
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastUpdated = "";
    const tick = async () => {
      try {
        const res = await fetch("/api/flights", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FlightsResponse;
        if (!stop && data.updated !== lastUpdated) {
          lastUpdated = data.updated;
          setState({ data, receivedAt: Date.now(), error: false });
        }
      } catch {
        if (!stop) setState({ error: true });
      }
      if (!stop) timer = setTimeout(tick, document.hidden ? intervalMs * 4 : intervalMs);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [intervalMs]);
}

// ---- Shared polled resources (deduplicated across components) -------------

interface Resource<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
}

const resources = new Map<string, Resource<unknown>>();

function usePolled<T>(url: string | null, intervalMs: number): { data: T | null; error: boolean; loading: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!url) return;
    let r = resources.get(url) as Resource<T> | undefined;
    if (!r) {
      r = { data: null, error: false, loading: true, listeners: new Set() };
      resources.set(url, r as Resource<unknown>);
    }
    const res = r;
    const notify = () => res.listeners.forEach((l) => l());
    const load = async () => {
      try {
        const resp = await fetch(url, { cache: "no-store" });
        if (resp.status === 404) {
          res.data = null;
          res.error = true;
        } else if (resp.ok) {
          res.data = (await resp.json()) as T;
          res.error = false;
        }
      } catch {
        // keep last good data
      }
      res.loading = false;
      notify();
    };
    const l = () => force((n) => n + 1);
    res.listeners.add(l);
    if (res.listeners.size === 1) {
      load();
      res.timer = setInterval(load, intervalMs);
    }
    return () => {
      res.listeners.delete(l);
      if (res.listeners.size === 0) {
        clearInterval(res.timer);
        resources.delete(url);
      }
    };
  }, [url, intervalMs]);
  const r = url ? (resources.get(url) as Resource<T> | undefined) : undefined;
  return { data: r?.data ?? null, error: r?.error ?? false, loading: r?.loading ?? !!url };
}

export const useFlightDetail = (callsign: string | null) =>
  usePolled<FlightDetail>(callsign ? `/api/flights/${encodeURIComponent(callsign)}` : null, 15000);

export const useAirportDetail = (code: string | null) =>
  usePolled<AirportDetail>(code ? `/api/airports/${encodeURIComponent(code)}` : null, 30000);

/** [icao, iata, name, lat, lon, size, arrivals, departures] */
export type AirportRow = [string, string, string, number, number, number, number, number];
export const useAirportRows = () => usePolled<AirportRow[]>("/api/airports", 120000);
