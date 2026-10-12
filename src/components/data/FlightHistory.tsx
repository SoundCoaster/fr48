"use client";

import { Loader2, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AirlineLogo } from "@/components/ui/AirlineLogo";
import { useStore } from "@/lib/client/store";
import { useNow } from "@/lib/client/useNow";
import { fmtDistance, fmtHM, fmtTime, tzAbbr } from "@/lib/format";
import type { FlightHistoryEntry, FlightHistoryResponse, MiniAirport } from "@/lib/types";

/** Flight history table for a callsign or a registration (FR24 "data" page style). */
export function FlightHistory({ query }: { query: { callsign?: string; reg?: string } }) {
  const key = query.callsign ? `callsign=${encodeURIComponent(query.callsign)}` : `reg=${encodeURIComponent(query.reg ?? "")}`;
  const [state, setState] = useState<{ key: string; data: FlightHistoryResponse | null } | null>(null);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch(`/api/history?${key}`)
        .then((r) => (r.ok ? (r.json() as Promise<FlightHistoryResponse>) : null))
        .then((data) => !off && setState({ key, data }))
        .catch(() => !off && setState({ key, data: null }));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [key]);

  const data = state?.key === key ? state.data : undefined;
  const byReg = !query.callsign;
  const first = data?.flights[0];
  const title = byReg ? (query.reg ?? "").toUpperCase() : (query.callsign ?? "").toUpperCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        {first?.airline && !byReg && (
          <span className="flex h-12 items-center rounded-md bg-white px-2">
            <AirlineLogo airline={first.airline} height={30} className="max-w-[120px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fr-yellow">{byReg ? "Aircraft history" : "Flight history"}</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
            {!byReg && first?.flightNumber && <span className="ml-3 text-lg font-medium text-fr-muted">{first.flightNumber}</span>}
          </h1>
          <p className="mt-1 text-fr-muted">
            {byReg
              ? first
                ? `${first.aircraftName}${first.airline ? ` · ${first.airline.name}` : ""}`
                : "Registration"
              : first
                ? [first.airline?.name, first.aircraftName].filter(Boolean).join(" · ")
                : "Callsign"}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-fr-panel">
        {data === undefined ? (
          <div className="grid h-40 place-items-center text-fr-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : !data || data.flights.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-fr-muted">
            No flights recorded for {title} yet. History is kept for 90 days from when Flightradar48 started recording.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px] tabular">
              <thead className="text-[10px] uppercase tracking-wider text-fr-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  {byReg && <th className="py-2.5 font-semibold">Flight</th>}
                  <th className="py-2.5 font-semibold">From</th>
                  <th className="py-2.5 font-semibold">To</th>
                  {!byReg && <th className="py-2.5 font-semibold">Aircraft</th>}
                  <th className="py-2.5 font-semibold">Flight time</th>
                  <th className="py-2.5 font-semibold">STD</th>
                  <th className="py-2.5 font-semibold">ATD</th>
                  <th className="py-2.5 font-semibold">STA</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.flights.map((f) => (
                  <Row key={`${f.callsign}${f.firstSeen}${f.live}`} f={f} byReg={byReg} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ f, byReg }: { f: FlightHistoryEntry; byReg: boolean }) {
  const timeZone = useStore((s) => s.settings.timeZone);
  const unit = useStore((s) => s.settings.distanceUnit);
  const now = useNow(30000) ?? 0;
  const tz = (a: MiniAirport | null) => (timeZone === "local" ? a?.tz ?? "UTC" : "UTC");
  const dateTs = f.atd ?? f.firstSeen;
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: tz(f.origin) }).format(dateTs * 1000);
  const flown = f.atd ? (f.ata ?? (f.live ? now : f.lastSeen)) - f.atd : null;

  return (
    <tr className="border-t border-white/5 hover:bg-white/[0.03]">
      <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{date}</td>
      {byReg && (
        <td className="py-2.5">
          <Link href={`/data/flights/${encodeURIComponent(f.callsign)}`} className="font-semibold text-fr-yellow hover:underline">
            {f.callsign}
          </Link>
          {f.flightNumber && <span className="block text-[11px] text-fr-muted">{f.flightNumber}</span>}
        </td>
      )}
      <td className="max-w-[180px] py-2.5">
        <AirportCell airport={f.origin} code={f.dep} />
      </td>
      <td className="max-w-[180px] py-2.5">
        <AirportCell airport={f.destination} code={f.arr} />
      </td>
      {!byReg && (
        <td className="py-2.5">
          <span className="text-white/90">{f.type || "—"}</span>
          {f.reg && (
            <Link href={`/data/aircraft/${encodeURIComponent(f.reg)}`} className="block text-[11px] text-fr-yellow hover:underline">
              {f.reg}
            </Link>
          )}
        </td>
      )}
      <td className="py-2.5">
        {flown !== null ? fmtHM(flown) : "—"}
        {f.distanceNm > 0 && <span className="block text-[11px] text-fr-muted">{fmtDistance(f.distanceNm, unit)}</span>}
      </td>
      <TimeCell ts={f.std} zone={tz(f.origin)} />
      <TimeCell ts={f.atd} zone={tz(f.origin)} />
      <TimeCell ts={f.sta} zone={tz(f.destination)} />
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {f.status === "live" ? (
          <Link href={`/${encodeURIComponent(f.callsign)}`} className="inline-flex items-center gap-1.5 rounded-full bg-fr-green/15 px-2.5 py-0.5 text-[12px] font-semibold text-fr-green hover:bg-fr-green/25">
            <Radio size={12} /> Live
          </Link>
        ) : f.status === "landed" ? (
          <span className="font-semibold text-fr-green">Landed {fmtTime(f.ata, tz(f.destination))}</span>
        ) : (
          <span className="text-fr-muted">Disconnected {fmtTime(f.lastSeen, tz(f.destination))}</span>
        )}
      </td>
    </tr>
  );
}

function AirportCell({ airport, code }: { airport: MiniAirport | null; code: string }) {
  if (!airport) return <span className="text-fr-muted">{code || "—"}</span>;
  return (
    <Link href={`/data/airports/${(airport.iata || airport.icao).toLowerCase()}`} className="block truncate hover:underline">
      <span className="text-white/90">{airport.city || airport.name}</span>{" "}
      <span className="text-fr-muted">({airport.iata || airport.icao})</span>
    </Link>
  );
}

function TimeCell({ ts, zone }: { ts: number | null; zone: string }) {
  return (
    <td className="whitespace-nowrap py-2.5">
      {fmtTime(ts, zone)}
      {ts !== null && <span className="ml-1 text-[10px] text-fr-muted">{tzAbbr(zone, ts)}</span>}
    </td>
  );
}
