"use client";

import Link from "next/link";
import { AirlineLogo } from "@/components/ui/AirlineLogo";
import { fmtTime } from "@/lib/format";
import type { BoardEntry } from "@/lib/types";

function statusText(e: BoardEntry, kind: "arr" | "dep", tz: string | null): { text: string; tone: string } {
  if (kind === "arr") {
    if (e.actual || e.status === "landed") return { text: `Landed ${fmtTime(e.actual, tz)}`, tone: "text-fr-green" };
    if (!e.online) return { text: "Scheduled", tone: "text-fr-muted" };
    if (e.status === "scheduled" || e.status === "taxiing") return { text: e.status === "taxiing" ? "Taxiing at origin" : "At gate (origin)", tone: "text-white/70" };
    if (e.estimated) {
      const late = e.scheduled && e.estimated - e.scheduled > 15 * 60;
      return { text: `${late ? "Delayed" : "Estimated"} ${fmtTime(e.estimated, tz)}`, tone: late ? "text-fr-red" : "text-fr-yellow" };
    }
    return { text: "En route", tone: "text-fr-yellow" };
  }
  if (e.actual) return { text: `Departed ${fmtTime(e.actual, tz)}`, tone: "text-fr-green" };
  if (!e.online) return { text: "Scheduled", tone: "text-fr-muted" };
  if (e.status === "taxiing") return { text: "Taxiing", tone: "text-fr-blue" };
  if (e.status === "enroute" || e.status === "departed" || e.status === "approach") return { text: "Airborne", tone: "text-fr-green" };
  if (e.status === "landed") return { text: "Landed", tone: "text-fr-green" };
  return { text: "Boarding", tone: "text-white/80" };
}

export function Board({
  entries,
  kind,
  tz,
  compact = false,
  limit,
}: {
  entries: BoardEntry[];
  kind: "arr" | "dep";
  tz: string | null;
  compact?: boolean;
  limit?: number;
}) {
  const rows = limit ? entries.slice(0, limit) : entries;
  if (!rows.length) {
    return <div className="py-8 text-center text-sm text-fr-muted">No {kind === "arr" ? "arrivals" : "departures"} on VATSIM right now.</div>;
  }
  return (
    <table className="w-full text-left text-[13px] tabular">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-fr-muted">
          <th className="py-2 pl-3 font-semibold">Time</th>
          <th className="py-2 font-semibold">Flight</th>
          <th className="py-2 font-semibold">{kind === "arr" ? "From" : "To"}</th>
          {!compact && <th className="py-2 font-semibold">Airline</th>}
          {!compact && <th className="py-2 font-semibold">Aircraft</th>}
          <th className="py-2 pr-3 text-right font-semibold">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const s = statusText(e, kind, tz);
          const href = e.online ? `/${encodeURIComponent(e.callsign)}` : undefined;
          const cell = (children: React.ReactNode, cls = "") =>
            href ? (
              <Link href={href} className={`block py-2 ${cls}`}>
                {children}
              </Link>
            ) : (
              <div className={`py-2 ${cls}`}>{children}</div>
            );
          return (
            <tr key={`${e.callsign}${e.scheduled}`} className={`border-t border-white/5 ${href ? "hover:bg-white/[0.04]" : "opacity-75"}`}>
              <td className="pl-3 align-top">{cell(<span className="font-semibold">{fmtTime(e.scheduled, tz)}</span>)}</td>
              <td className="align-top">
                {cell(
                  <>
                    <span className="font-semibold text-white">{e.flightNumber ?? e.callsign}</span>
                    {compact && <span className="block text-[11px] text-fr-muted">{e.aircraft || "—"}</span>}
                    {!compact && e.flightNumber && <span className="block text-[11px] text-fr-muted">{e.callsign}</span>}
                  </>,
                )}
              </td>
              <td className="max-w-[140px] align-top">
                {cell(
                  <>
                    <span className="block truncate text-white/90">{e.airport ? e.airport.city || e.airport.name : "—"}</span>
                    <span className="block text-[11px] text-fr-muted">{e.airport ? `(${e.airport.iata || e.airport.icao})` : ""}</span>
                  </>,
                )}
              </td>
              {!compact && (
                <td className="align-top">
                  {cell(
                    <span className="flex items-center gap-2">
                      <AirlineLogo airline={e.airline} height={16} className="max-w-[56px]" />
                      <span className="hidden truncate text-white/80 xl:inline">{e.airline?.name ?? ""}</span>
                    </span>,
                  )}
                </td>
              )}
              {!compact && (
                <td className="align-top">
                  {cell(
                    <>
                      <span className="text-white/90">{e.aircraft || "—"}</span>
                      {e.registration && <span className="block text-[11px] text-fr-muted">{e.registration}</span>}
                    </>,
                  )}
                </td>
              )}
              <td className="pr-3 text-right align-top">{cell(<span className={`font-semibold ${s.tone}`}>{s.text}</span>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
