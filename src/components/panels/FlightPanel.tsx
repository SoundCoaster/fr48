"use client";

import {
  Box,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Gauge,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plane,
  Route as RouteIcon,
  Share,
  Star,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { useFlightDetail } from "@/lib/client/data";
import { setState, toggleBookmark, useStore } from "@/lib/client/store";
import { useNow } from "@/lib/client/useNow";
import { fmtAltitude, fmtDistance, fmtDuration, fmtHM, fmtSpeed, fmtTime, fmtTime12, fmtVs, tzLabel } from "@/lib/format";
import type { FlightDetail, MiniAirport } from "@/lib/types";
import { AircraftPhoto } from "./AircraftPhoto";

export function FlightPanel({ params }: { params: Promise<{ callsign: string }> }) {
  const callsign = decodeURIComponent(use(params).callsign).toUpperCase();
  const router = useRouter();
  const { data, error, failed, loading } = useFlightDetail(callsign);
  const unavailable = failed && !error;
  const detail = data && data.callsign === callsign ? data : null;

  useEffect(() => {
    if (detail) {
      document.title = `${detail.callsign}${detail.flightNumber ? ` (${detail.flightNumber})` : ""}${detail.airline ? ` - ${detail.airline.name}` : ""} | Flightradar48`;
    }
  }, [detail]);

  return (
    <>
    <aside className="fr-slide-in pointer-events-auto absolute left-3 top-3 z-30 hidden max-h-[calc(100%-88px)] w-[340px] flex-col overflow-hidden rounded-xl bg-[#2a2b2e] shadow-2xl sm:flex">
      {!detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-fr-muted">
          {loading && !error ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              <p>
                {unavailable ? (
                  <>Flight details for <b className="text-white">{callsign}</b> are temporarily unavailable. Retrying…</>
                ) : (
                  <>
                    <b className="text-white">{callsign}</b> is not currently online on VATSIM.
                  </>
                )}
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
    {detail ? (
      <MobileSheet detail={detail} onClose={() => router.push("/")} />
    ) : (
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex min-h-28 items-center justify-center gap-3 rounded-t-xl bg-[#2a2b2e] px-4 pb-safe text-sm text-fr-muted sm:hidden">
        {loading && !error ? (
          <Loader2 className="animate-spin" />
        ) : (
          <>
            <span>
              {unavailable ? (
                <>Details for <b className="text-white">{callsign}</b> temporarily unavailable.</>
              ) : (
                <>
                  <b className="text-white">{callsign}</b> is not online on VATSIM.
                </>
              )}
            </span>
            <button onClick={() => router.push("/")} className="rounded-full bg-white/10 px-3 py-1 text-white">
              Close
            </button>
          </>
        )}
      </div>
    )}
    </>
  );
}

// ---- Phones: compact bottom sheet (FR24 app layout) ----------------------------

function MobileSheet({ detail: d, onClose }: { detail: FlightDetail; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const s = useStore((st) => st.settings);
  const follow = useStore((st) => st.follow);
  const showRoute = useStore((st) => st.showRoute);
  const view3d = useStore((st) => st.view3d);
  const now = useNow(15000) ?? 0;

  if (expanded) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-[#2a2b2e] pt-safe pb-safe sm:hidden">
        <button onClick={() => setExpanded(false)} className="flex items-center justify-center gap-1.5 py-1.5 text-[12px] text-white/70">
          <ChevronDown size={16} /> Less info
        </button>
        <FlightContent detail={d} onClose={onClose} />
      </div>
    );
  }

  const p = d.progress;
  const code = (a: MiniAirport | null, raw?: string) => (a ? a.iata || a.icao : raw || "—");
  return (
    <div className="fr-slide-up pointer-events-auto absolute inset-x-0 bottom-0 z-30 overflow-hidden rounded-t-xl bg-[#2a2b2e] pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.35)] sm:hidden">
      <button onClick={() => setExpanded(true)} className="flex w-full items-stretch text-left">
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[19px] font-medium leading-none text-fr-yellow">{d.callsign}</span>
            {d.flightNumber && <span className="rounded-[3px] bg-[#5a5b5f] px-1 text-[11px] font-semibold leading-[17px] text-white">{d.flightNumber}</span>}
            {d.aircraft.code && <span className="rounded-[3px] bg-[#2f5d86] px-1 text-[11px] font-semibold leading-[17px] text-white">{d.aircraft.code}</span>}
          </div>
          <div className="mt-1.5 truncate text-[15px] text-white/90">{d.airline?.name ?? "Private / unknown operator"}</div>
        </div>
        <div className="w-[36%] shrink-0">
          <AircraftPhoto registration={d.aircraft.registration} silhouette={d.aircraft.silhouette} airline={d.airline?.name} compact />
        </div>
      </button>

      <div className="grid grid-cols-[1fr_118px] gap-1.5 bg-[#d5d6d8] p-1.5">
        <div className="rounded-md bg-[#ececed] px-2.5 pb-2 pt-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="min-w-0 text-center">
              <div className="text-[24px] font-medium leading-none text-[#3a3a3c]">{code(d.origin, d.flightPlan?.departure)}</div>
              <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-[#3a3a3c]">{d.origin?.city ?? ""}</div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f2c12e" aria-hidden>
                <path d={PLANE_PATH} transform="rotate(90 12 12)" />
              </svg>
            </span>
            <div className="min-w-0 text-center">
              <div className="text-[24px] font-medium leading-none text-[#3a3a3c]">{code(d.destination, d.flightPlan?.arrival)}</div>
              <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-[#3a3a3c]">{d.destination?.city ?? ""}</div>
            </div>
          </div>
          {p && (
            <>
              <div className="mt-2 h-[3px] rounded-full bg-[#cfd0d3]">
                <div className="h-full rounded-full bg-fr-yellow" style={{ width: `${p.pct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-[#55565a] tabular">
                <span className="truncate">{d.times.actualDeparture && now ? `Departed ${fmtHM(now - d.times.actualDeparture)} ago` : "Not departed"}</span>
                <span className="truncate">
                  {d.status === "landed" ? "Landed" : d.times.estimatedArrival && now ? `Arrives in ${fmtHM(d.times.estimatedArrival - now)}` : ""}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="space-y-2 rounded-md bg-[#ececed] px-2.5 py-2">
          <MiniStat label="Altitude" value={fmtAltitude(d.position.altitude, s.altitudeUnit)} />
          <MiniStat label="Ground speed" value={fmtSpeed(d.position.groundspeed, s.speedUnit)} />
        </div>
        <div className="truncate rounded-md bg-[#ececed] px-2.5 py-2 text-[15px] text-[#26272a]">{d.aircraft.name}</div>
        <div className="flex items-baseline gap-1.5 truncate rounded-md bg-[#ececed] px-2.5 py-2">
          <span className="text-[10px] uppercase tracking-wide text-[#6b6c70]">Reg.</span>
          <span className="truncate text-[15px] text-[#26272a]">{d.aircraft.registration ?? "—"}</span>
        </div>
      </div>

      <nav className="grid grid-cols-5 bg-[#2a2b2e] text-[11px]">
        <Action active={view3d} onClick={() => setState({ view3d: !view3d })} icon={<Box size={21} strokeWidth={1.5} />} label="3D view" />
        <Action active={showRoute} onClick={() => setState({ showRoute: !showRoute })} icon={<RouteGlyph />} label="Route" />
        <Action onClick={() => setExpanded(true)} icon={<ChevronUp size={22} strokeWidth={1.5} />} label="More info" />
        <Action active={follow} onClick={() => setState({ follow: !follow })} icon={<FollowGlyph />} label="Follow" />
        <Action
          onClick={() => {
            const url = window.location.href;
            if (navigator.share) navigator.share({ title: d.callsign, url }).catch(() => {});
            else navigator.clipboard?.writeText(url).catch(() => {});
          }}
          icon={<Share size={21} strokeWidth={1.5} />}
          label="Share"
        />
      </nav>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#6b6c70]">{label}</div>
      <div className="truncate text-[15px] text-[#26272a] tabular">{value}</div>
    </div>
  );
}

function FlightContent({ detail: d, onClose }: { detail: FlightDetail; onClose: () => void }) {
  const [more, setMore] = useState(true);
  const starred = useStore((s) => s.bookmarks.some((b) => b.kind === "flight" && b.id === d.callsign));

  return (
    <>
      {/* Header */}
      <header className="px-3 pb-2 pt-2.5 text-white">
        <div className="flex items-center gap-1.5">
          <h1 className="text-[19px] font-medium leading-none tracking-tight text-fr-yellow">{d.callsign}</h1>
          {d.flightNumber && <span className="rounded-[3px] bg-[#cfd0d2] px-1 text-[11px] font-semibold leading-[17px] text-[#222]">{d.flightNumber}</span>}
          {d.aircraft.code && <span className="rounded-[3px] bg-[#2f5d86] px-1 text-[11px] font-semibold leading-[17px] text-white">{d.aircraft.code}</span>}
          <button
            onClick={() =>
              toggleBookmark({
                kind: "flight",
                id: d.callsign,
                label: d.flightNumber ? `${d.callsign} · ${d.flightNumber}` : d.callsign,
                sub: [d.origin?.iata || d.flightPlan?.departure, d.destination?.iata || d.flightPlan?.arrival].filter(Boolean).join(" → "),
              })
            }
            className="ml-auto rounded p-0.5 text-fr-yellow hover:bg-white/10"
            aria-label={starred ? "Remove bookmark" : "Bookmark this flight"}
          >
            <Star size={19} strokeWidth={1.6} fill={starred ? "currentColor" : "none"} />
          </button>
          <button onClick={onClose} className="rounded p-0.5 text-white/90 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={21} strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] text-white/90">
            {d.airline?.name ?? (d.flightPlan?.flight_rules === "V" ? "VFR flight" : "Private / unknown operator")}
          </span>
          <Logo height={15} className="shrink-0 opacity-90" />
        </div>
      </header>

      <div className="fr-scroll flex-1 overflow-y-auto bg-[#d5d6d8]">
        <AircraftPhoto registration={d.aircraft.registration} silhouette={d.aircraft.silhouette} airline={d.airline?.name} />
        <RouteBlock d={d} />
        <Progress d={d} />

        <button
          onClick={() => setMore(!more)}
          className="flex w-full items-center gap-3 bg-[#4278b1] px-4 py-2 text-[14px] text-white hover:bg-[#4a82bd]"
        >
          <InfoPlaneIcon />
          <span className="flex-1 text-center">More {d.flightNumber ?? d.callsign} information</span>
          <ChevronDown size={18} className={`transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
        {more && <Details d={d} />}
      </div>

      <ActionBar d={d} />
    </>
  );
}

// ---- Route & times -----------------------------------------------------------

const PLANE_PATH = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";

function RouteBlock({ d }: { d: FlightDetail }) {
  const timeZone = useStore((s) => s.settings.timeZone);
  const zone = (a: MiniAirport | null) => (timeZone === "local" ? a?.tz ?? "UTC" : "UTC");
  const late = d.times.estimatedArrival !== null && d.times.scheduledArrival !== null ? d.times.estimatedArrival - d.times.scheduledArrival : 0;
  const dot = late > 45 * 60 ? "bg-[#e5483b]" : late > 15 * 60 ? "bg-[#f0a020]" : "bg-[#3fbf6f]";

  return (
    <div className="bg-[#ececed]">
      <div className="relative grid grid-cols-2">
        <Endpoint airport={d.origin} code={d.flightPlan?.departure} zone={zone(d.origin)} />
        <Endpoint airport={d.destination} code={d.flightPlan?.arrival} zone={zone(d.destination)} border />
        <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-sm">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#f2c12e" aria-hidden>
            <path d={PLANE_PATH} transform="rotate(90 12 12)" />
          </svg>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-[2px] bg-[#f6f6f7] pt-[2px]">
        <TimeRow label="Scheduled" ts={d.times.scheduledDeparture} tz={zone(d.origin)} />
        <TimeRow label="Scheduled" ts={d.times.scheduledArrival} tz={zone(d.destination)} />
        <TimeRow label={d.times.actualDeparture ? "Actual" : "Estimated"} ts={d.times.actualDeparture} tz={zone(d.origin)} />
        <TimeRow
          label={d.times.actualArrival ? "Actual" : "Estimated"}
          ts={d.times.actualArrival ?? d.times.estimatedArrival}
          tz={zone(d.destination)}
          dot={d.times.actualArrival ? undefined : dot}
        />
      </div>
    </div>
  );
}

function Endpoint({ airport, code, zone, border }: { airport: MiniAirport | null; code?: string; zone: string; border?: boolean }) {
  const label = airport ? airport.iata || airport.icao : code || "N/A";
  const inner = (
    <>
      <div className="text-[33px] font-medium leading-none tracking-tight text-[#3a3a3c]">{label}</div>
      <div className="mt-1.5 max-w-full truncate px-2 text-[13px] font-medium uppercase tracking-wide text-[#3a3a3c]">
        {airport?.city || airport?.name || (code ? "Unknown airport" : "No flight plan")}
      </div>
      <div className="mt-0.5 h-3.5 text-[10px] text-[#8a8b8f]">{airport ? tzLabel(zone) : ""}</div>
    </>
  );
  const cls = `flex min-w-0 flex-col items-center px-1 pb-2.5 pt-3 text-center ${border ? "border-l border-[#d2d3d5]" : ""}`;
  return airport ? (
    <Link href={`/airport/${airport.icao}`} className={`${cls} hover:bg-white/50`} title={airport.name}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function TimeRow({ label, ts, tz, dot }: { label: string; ts: number | null; tz: string; dot?: string }) {
  const t = fmtTime12(ts, tz);
  return (
    <div className="flex items-center justify-between bg-[#dfe0e2] px-2.5 py-1.5">
      <span className="text-[11.5px] uppercase tracking-wide text-[#55565a]">{label}</span>
      <span className="flex items-baseline gap-1 text-[#2f3033]">
        {dot && t && <span className={`mr-0.5 h-1.5 w-1.5 self-center rounded-full ${dot}`} />}
        <span className="text-[17px] font-medium tabular">{t?.time ?? "—"}</span>
        {t && <span className="text-[10px] text-[#55565a]">{t.ampm}</span>}
      </span>
    </div>
  );
}

function Progress({ d }: { d: FlightDetail }) {
  const unit = useStore((s) => s.settings.distanceUnit);
  const now = useNow(15000) ?? 0;
  const p = d.progress;
  if (!p) return null;
  const pct = Math.min(96, Math.max(2, p.pct));
  return (
    <div className="bg-[#f1f1f2] px-3 pb-2 pt-2.5">
      <div className="relative mx-1 h-[3px] rounded-full bg-[#cfd0d3]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#8b8c90]" style={{ width: `${p.pct}%` }} />
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#4a4b4f" aria-hidden>
            <path d={PLANE_PATH} transform="rotate(90 12 12)" />
          </svg>
        </span>
      </div>
      <div className="mt-2.5 flex justify-between text-[12px] text-[#4a4b4f] tabular">
        <span>
          {fmtDistance(p.flownNm, unit)}
          {d.times.actualDeparture && now ? `, ${fmtHM(now - d.times.actualDeparture)} ago` : ""}
        </span>
        <span>
          {fmtDistance(p.remainingNm, unit)}
          {d.status !== "landed" && d.times.estimatedArrival && now ? `, in ${fmtHM(d.times.estimatedArrival - now)}` : ""}
        </span>
      </div>
    </div>
  );
}

// ---- More information ------------------------------------------------------

function Details({ d }: { d: FlightDetail }) {
  const s = useStore((st) => st.settings);
  const fp = d.flightPlan;
  return (
    <div className="divide-y divide-[#d9dadc]">
      <DetailGroup icon={Plane}>
        <Field
          label={
            <>
              Aircraft type {d.aircraft.code && <span className="text-[#444]">({d.aircraft.code})</span>}
            </>
          }
          value={d.aircraft.name}
          wide
        />
        <Field label="Registration" value={d.aircraft.registration ?? "—"} />
        <Field label="Wake category" value={WAKE[d.aircraft.wake ?? ""] ?? "—"} />
        <Field label="Equipment" value={d.aircraft.equipment ?? "—"} wide mono />
      </DetailGroup>
      <DetailGroup icon={Gauge}>
        <Field label="Altitude" value={fmtAltitude(d.position.altitude, s.altitudeUnit)} />
        <Field label="Vertical speed" value={fmtVs(d.position.verticalSpeed, s.altitudeUnit)} />
        <Field label="Ground speed" value={fmtSpeed(d.position.groundspeed, s.speedUnit)} />
        <Field label="Track" value={`${Math.round(d.position.heading)}°`} />
        <Field label="Squawk" value={d.position.squawk} />
        <Field label="QNH" value={`${d.position.qnhMb} hPa`} />
        <Field label="Latitude" value={d.position.lat.toFixed(4)} />
        <Field label="Longitude" value={d.position.lon.toFixed(4)} />
      </DetailGroup>
      <DetailGroup icon={User}>
        <Field label="Pilot" value={d.name} wide />
        <Field label="VATSIM ID" value={String(d.cid)} />
        <Field label="Rating" value={d.pilotRating || "—"} />
        <Field label="Server" value={d.server} />
        <Field label="Online since" value={`${fmtTime(Date.parse(d.logonTime) / 1000)} UTC`} />
      </DetailGroup>
      {fp && (
        <DetailGroup icon={RouteIcon}>
          <Field label="Flight rules" value={fp.flight_rules === "V" ? "VFR" : "IFR"} />
          <Field label="Cruise" value={fp.altitude ? fmtAltitude(+fp.altitude, s.altitudeUnit) : "—"} />
          <Field label="True airspeed" value={fp.cruise_tas ? `${fp.cruise_tas} kts` : "—"} />
          <Field label="Alternate" value={d.alternate ? d.alternate.iata || d.alternate.icao : fp.alternate || "—"} />
          <Field label="Enroute time" value={fmtDuration(hhmm(fp.enroute_time))} />
          <Field label="Fuel on board" value={fmtDuration(hhmm(fp.fuel_time))} />
          <Field label="Route" value={fp.route || "—"} wide mono />
          {fp.remarks && <Field label="Remarks" value={fp.remarks} wide mono />}
        </DetailGroup>
      )}
    </div>
  );
}

function DetailGroup({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex">
      <div className="flex w-9 shrink-0 justify-center bg-[#e3e4e6] pt-3 text-[#4a4b4f]">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5 bg-[#f6f6f7] px-3 py-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value, wide, mono }: { label: ReactNode; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-[#6b6c70]">{label}</div>
      <div className={`break-words text-[#26272a] ${mono ? "font-mono text-[11px] leading-relaxed" : "text-[15px]"}`}>{value}</div>
    </div>
  );
}

// ---- Action bar ----------------------------------------------------------------

function ActionBar({ d }: { d: FlightDetail }) {
  const follow = useStore((s) => s.follow);
  const showRoute = useStore((s) => s.showRoute);
  const view3d = useStore((s) => s.view3d);
  const [shared, setShared] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: d.callsign, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 1500);
      }
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      {menu && (
        <div className="absolute bottom-full right-2 mb-2 w-60 overflow-hidden rounded-lg bg-[#2a2b2e] py-1 text-[13px] text-white shadow-2xl ring-1 ring-white/10">
          {d.origin && (
            <MenuLink href={`/airport/${d.origin.icao}`} icon={<MapPin size={15} />}>
              Departure airport · {d.origin.iata || d.origin.icao}
            </MenuLink>
          )}
          {d.destination && (
            <MenuLink href={`/airport/${d.destination.icao}`} icon={<MapPin size={15} />}>
              Arrival airport · {d.destination.iata || d.destination.icao}
            </MenuLink>
          )}
          {d.flightPlan?.route && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(d.flightPlan!.route).catch(() => {});
                setMenu(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5"
            >
              <Copy size={15} /> Copy flight plan route
            </button>
          )}
          <a href={`https://stats.vatsim.net/stats/${d.cid}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5">
            <ExternalLink size={15} /> Pilot&apos;s VATSIM statistics
          </a>
        </div>
      )}
      <nav className="grid grid-cols-5 bg-[#2a2b2e] text-[11px]">
        <Action active={view3d} onClick={() => setState({ view3d: !view3d })} icon={<Box size={21} strokeWidth={1.5} />} label="3D view" />
        <Action active={showRoute} onClick={() => setState({ showRoute: !showRoute })} icon={<RouteGlyph />} label="Route" />
        <Action active={follow} onClick={() => setState({ follow: !follow })} icon={<FollowGlyph />} label="Follow" />
        <Action onClick={share} icon={<Share size={21} strokeWidth={1.5} />} label={shared ? "Copied!" : "Share"} active={shared} />
        <Action onClick={() => setMenu(!menu)} icon={<MoreHorizontal size={22} strokeWidth={1.5} />} label="More" active={menu} />
      </nav>
    </div>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5">
      {icon}
      {children}
    </Link>
  );
}

function Action({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2 ${active ? "text-fr-yellow" : "text-white/90 hover:text-white"}`}>
      {icon}
      {label}
    </button>
  );
}

// ---- Glyphs ------------------------------------------------------------------

const RouteGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="18" cy="19" r="2.2" />
    <path d="M7.5 6.7c3 4 6.5 5.5 9 10.6" />
  </svg>
);

const FollowGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 3l6 6M9 4v5H4M21 3l-6 6M15 4v5h5M3 21l6-6M9 20v-5H4M21 21l-6-6M15 20v-5h5" />
  </svg>
);

const InfoPlaneIcon = () => (
  <svg width="26" height="20" viewBox="0 0 30 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 6l3 1 3 3 8-4 6 1-6 3-3 6-2-1 1-4-4 1-2 3-1-1 1-3-4-2z" />
    <circle cx="23" cy="15" r="5.5" />
    <path d="M23 13.2v4.2M23 11.3v.1" />
  </svg>
);

const WAKE: Record<string, string> = { L: "Light", M: "Medium", H: "Heavy", J: "Super" };

function hhmm(v: string | undefined): number | null {
  if (!v || !/^\d{1,4}$/.test(v)) return null;
  const s = v.padStart(4, "0");
  return (+s.slice(0, 2) * 60 + +s.slice(2)) * 60;
}
