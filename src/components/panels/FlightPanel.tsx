"use client";

import { ChevronDown, Crosshair, Link2, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState, type ReactNode } from "react";
import { AircraftIcon } from "@/components/ui/AircraftIcon";
import { AirlineLogo } from "@/components/ui/AirlineLogo";
import { useFlightDetail } from "@/lib/client/data";
import { setState, useStore } from "@/lib/client/store";
import { useNow } from "@/lib/client/useNow";
import {
  fmtAltitude,
  fmtDistance,
  fmtDuration,
  fmtSpeed,
  fmtTime,
  fmtVs,
  STATUS_LABEL,
  tzAbbr,
} from "@/lib/format";
import type { FlightDetail, MiniAirport } from "@/lib/types";
import { AircraftPhoto } from "./AircraftPhoto";

export function FlightPanel({ params }: { params: Promise<{ callsign: string }> }) {
  const callsign = decodeURIComponent(use(params).callsign).toUpperCase();
  const router = useRouter();
  const { data, error, loading } = useFlightDetail(callsign);
  const detail = data && data.callsign === callsign ? data : null;

  useEffect(() => {
    if (detail) {
      document.title = `${detail.flightNumber ?? detail.callsign}${detail.airline ? ` - ${detail.airline.name}` : ""} | Flightradar48`;
    }
  }, [detail]);

  return (
    <aside className="fr-slide-in pointer-events-auto absolute bottom-[64px] left-0 top-0 z-20 flex w-full flex-col overflow-hidden bg-fr-panel shadow-2xl sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[calc(100%-80px)] sm:w-[372px] sm:rounded-xl">
      {!detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-fr-muted">
          {loading && !error ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              <p>
                <b className="text-white">{callsign}</b> is not currently online on VATSIM.
              </p>
              <button onClick={() => router.push("/")} className="rounded-full bg-white/10 px-4 py-1.5 text-white hover:bg-white/15">
                Back to map
              </button>
            </>
          )}
        </div>
      ) : (
        <FlightContent detail={detail} onClose={() => router.push("/")} />
      )}
    </aside>
  );
}

function FlightContent({ detail: d, onClose }: { detail: FlightDetail; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const follow = useStore((s) => s.follow);
  const [copied, setCopied] = useState(false);
  const now = useNow(5000) ?? d.times.actualDeparture ?? 0;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const depTime = d.times.actualDeparture ?? null;
  const arrTime = d.times.actualArrival ?? d.times.estimatedArrival;

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 bg-fr-bg px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-fr-yellow">{d.flightNumber ?? d.callsign}</h1>
            {d.flightNumber && <span className="text-sm font-medium text-fr-muted">{d.callsign}</span>}
            {d.aircraft.code && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white/90">{d.aircraft.code}</span>
            )}
          </div>
          <div className="truncate text-[13px] text-fr-muted">{d.airline?.name ?? (d.flightPlan?.flight_rules === "V" ? "VFR flight" : "Private / Unknown operator")}</div>
        </div>
        {d.airline && (
          <span className="mt-0.5 flex h-8 items-center rounded-md bg-white px-1.5">
            <AirlineLogo airline={d.airline} height={22} className="max-w-[88px]" />
          </span>
        )}
        <button onClick={onClose} className="-mr-1 rounded-full p-1.5 text-fr-muted hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="fr-scroll flex-1 overflow-y-auto">
        <AircraftPhoto registration={d.aircraft.registration} silhouette={d.aircraft.silhouette} airline={d.airline?.name} />

        {/* Route block */}
        <div className="bg-fr-panel-2 px-4 pb-4 pt-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <AirportEnd airport={d.origin} code={d.flightPlan?.departure} align="left" />
            <div className="pt-2 text-fr-muted">
              <AircraftIcon silhouette="narrow" size={22} rotate={90} fill="currentColor" />
            </div>
            <AirportEnd airport={d.destination} code={d.flightPlan?.arrival} align="right" />
          </div>

          {d.progress && (
            <div className="mt-4">
              <div className="relative h-[5px] rounded-full bg-white/10">
                <div className="absolute inset-y-0 left-0 rounded-full bg-fr-yellow" style={{ width: `${d.progress.pct}%` }} />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-fr-yellow drop-shadow"
                  style={{ left: `${Math.min(97, Math.max(3, d.progress.pct))}%` }}
                >
                  <AircraftIcon silhouette={d.aircraft.silhouette} size={20} rotate={90} fill="currentColor" />
                </div>
              </div>
              <div className="mt-2 flex justify-between text-xs text-fr-muted tabular">
                <span>
                  {fmtDistance(d.progress.flownNm, settings.distanceUnit)}
                  {depTime ? `, ${fmtDuration(now - depTime)} ago` : ""}
                </span>
                <span>
                  {fmtDistance(d.progress.remainingNm, settings.distanceUnit)}
                  {d.status !== "landed" && d.times.estimatedArrival ? `, in ${fmtDuration(d.times.estimatedArrival - now)}` : ""}
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/5 text-xs">
            <TimeCell label="Scheduled" value={d.times.scheduledDeparture} tz={d.origin?.tz} settingsTz={settings.timeZone} />
            <TimeCell label="Scheduled" value={d.times.scheduledArrival} tz={d.destination?.tz} settingsTz={settings.timeZone} />
            <TimeCell label="Actual" value={d.times.actualDeparture} tz={d.origin?.tz} settingsTz={settings.timeZone} />
            <TimeCell
              label={d.times.actualArrival ? "Actual" : "Estimated"}
              value={arrTime}
              tz={d.destination?.tz}
              settingsTz={settings.timeZone}
              highlight={!d.times.actualArrival}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <StatusPill status={d.status} />
            <span className="text-fr-muted">
              {d.flightPlan?.flight_rules === "V" ? "VFR" : "IFR"} · {d.flightPlan?.altitude ? `FL${Math.round(+d.flightPlan.altitude / 100)}` : "—"}
            </span>
          </div>
        </div>

        {/* Live data */}
        <Section title="Flight data" defaultOpen>
          <Grid>
            <Cell label="Altitude" value={fmtAltitude(d.position.altitude, settings.altitudeUnit)} />
            <Cell label="Vertical speed" value={fmtVs(d.position.verticalSpeed, settings.altitudeUnit)} />
            <Cell label="Ground speed" value={fmtSpeed(d.position.groundspeed, settings.speedUnit)} />
            <Cell label="Track" value={`${Math.round(d.position.heading)}°`} />
            <Cell label="Squawk" value={d.position.squawk} />
            <Cell label="QNH" value={`${d.position.qnhMb} hPa`} />
            <Cell label="Latitude" value={d.position.lat.toFixed(4)} />
            <Cell label="Longitude" value={d.position.lon.toFixed(4)} />
          </Grid>
        </Section>

        <Section title="Aircraft" defaultOpen>
          <Grid>
            <Cell label="Aircraft type" value={d.aircraft.code || "—"} wide sub={d.aircraft.name !== d.aircraft.code ? d.aircraft.name : undefined} />
            <Cell label="Registration" value={d.aircraft.registration ?? "—"} />
            <Cell label="Wake category" value={wake(d.aircraft.wake)} />
            <Cell label="Equipment" value={d.aircraft.equipment ?? "—"} wide mono />
          </Grid>
        </Section>

        <Section title="Pilot">
          <Grid>
            <Cell label="Name" value={d.name} wide />
            <Cell label="VATSIM ID" value={String(d.cid)} />
            <Cell label="Rating" value={d.pilotRating || "—"} />
            <Cell label="Server" value={d.server} />
            <Cell label="Online since" value={`${fmtTime(Date.parse(d.logonTime) / 1000)} UTC`} />
          </Grid>
        </Section>

        {d.flightPlan && (
          <Section title="Flight plan">
            <Grid>
              <Cell label="Cruise" value={d.flightPlan.altitude ? fmtAltitude(+d.flightPlan.altitude, settings.altitudeUnit) : "—"} />
              <Cell label="TAS" value={d.flightPlan.cruise_tas ? `${d.flightPlan.cruise_tas} kts` : "—"} />
              <Cell label="Enroute" value={fmtDuration(hhmm(d.flightPlan.enroute_time))} />
              <Cell label="Fuel" value={fmtDuration(hhmm(d.flightPlan.fuel_time))} />
              <Cell
                label="Alternate"
                value={d.alternate ? `${d.alternate.iata || d.alternate.icao}` : d.flightPlan.alternate || "—"}
                sub={d.alternate?.city}
              />
              <Cell label="Distance" value={d.progress ? fmtDistance(d.progress.totalNm, settings.distanceUnit) : "—"} />
            </Grid>
            <Text label="Route" value={d.flightPlan.route} />
            <Text label="Remarks" value={d.flightPlan.remarks} />
          </Section>
        )}
        <div className="h-3" />
      </div>

      {/* Action bar */}
      <div className="grid grid-cols-3 border-t border-white/5 bg-fr-bg text-[11px] font-medium text-fr-muted">
        <ActionButton active={follow} onClick={() => setState({ follow: !follow })} icon={<Crosshair size={18} />} label="Follow" />
        <ActionButton onClick={share} icon={<Link2 size={18} />} label={copied ? "Copied!" : "Share"} />
        {d.destination ? (
          <Link href={`/airport/${d.destination.icao}`} className="flex flex-col items-center gap-1 py-2.5 hover:bg-white/5 hover:text-white">
            <ArrivalIcon />
            {d.destination.iata || d.destination.icao}
          </Link>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

function AirportEnd({ airport, code, align }: { airport: MiniAirport | null; code?: string; align: "left" | "right" }) {
  const label = airport ? airport.iata || airport.icao : code || "N/A";
  const inner = (
    <>
      <div className="text-[30px] font-bold leading-none tracking-tight text-white">{label}</div>
      <div className="mt-1 truncate text-[13px] text-white/85">{airport?.city || airport?.name || (code ? "Unknown airport" : "No flight plan")}</div>
      {airport && <div className="truncate text-[11px] text-fr-muted">{airport.icao}</div>}
    </>
  );
  const cls = `min-w-0 ${align === "right" ? "text-right" : ""}`;
  return airport ? (
    <Link href={`/airport/${airport.icao}`} className={`${cls} hover:opacity-80`} title={airport.name}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function TimeCell({
  label,
  value,
  tz,
  settingsTz,
  highlight,
}: {
  label: string;
  value: number | null;
  tz?: string | null;
  settingsTz: "utc" | "local";
  highlight?: boolean;
}) {
  const zone = settingsTz === "local" ? tz : "UTC";
  return (
    <div className="bg-fr-panel px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{label}</div>
      <div className={`tabular text-[15px] font-semibold ${highlight && value ? "text-fr-yellow" : "text-white"}`}>
        {fmtTime(value, zone)}
        {value !== null && <span className="ml-1 text-[10px] font-medium text-fr-muted">{tzAbbr(zone, value)}</span>}
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: FlightDetail["status"] }) {
  const color =
    status === "landed" ? "bg-fr-green/20 text-fr-green" :
    status === "scheduled" || status === "unknown" ? "bg-white/10 text-white/80" :
    status === "taxiing" ? "bg-fr-blue/20 text-fr-blue" :
    "bg-fr-yellow/20 text-fr-yellow";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color}`}>{STATUS_LABEL[status]}</span>;
}

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-white/5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold hover:bg-white/[0.03]">
        {title}
        <ChevronDown size={16} className={`text-fr-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;

function Cell({ label, value, sub, wide, mono }: { label: string; value: string; sub?: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{label}</div>
      <div className={`break-words text-sm font-medium text-white tabular ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-fr-muted">{sub}</div>}
    </div>
  );
}

function Text({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{label}</div>
      <p className="mt-0.5 break-words rounded-md bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-white/85">{value}</p>
    </div>
  );
}

function ActionButton({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-2.5 hover:bg-white/5 hover:text-white ${active ? "text-fr-yellow" : ""}`}>
      {icon}
      {label}
    </button>
  );
}

function ArrivalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 22h20" />
      <path d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z" />
    </svg>
  );
}

const WAKE: Record<string, string> = { L: "Light", M: "Medium", H: "Heavy", J: "Super" };
const wake = (w: string | null) => (w ? WAKE[w] ?? w : "—");

function hhmm(v: string | undefined): number | null {
  if (!v || !/^\d{1,4}$/.test(v)) return null;
  const s = v.padStart(4, "0");
  return (+s.slice(0, 2) * 60 + +s.slice(2)) * 60;
}
