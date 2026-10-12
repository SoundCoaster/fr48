"use client";

import {
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Plane,
  MapPin,
  Sun,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toggleBookmark, updateSettings, useStore, type Settings } from "@/lib/client/store";
import { decodeMetar, type DecodedMetar } from "@/lib/metar";
import type { BusyAirport, TrackedFlight } from "@/lib/types";

type WidgetKey = keyof Settings["widgets"];

/** Left-hand widget column shown on the live map when no panel is open. */
export function WidgetsColumn() {
  const pathname = usePathname();
  const widgets = useStore((s) => s.settings.widgets);
  if (pathname !== "/" || !(widgets.tracked || widgets.airports || widgets.bookmarks)) return null;
  return (
    <div className="fr-scroll pointer-events-auto absolute bottom-[80px] left-3 top-3 z-20 hidden w-[290px] flex-col gap-2 overflow-y-auto sm:flex">
      {widgets.tracked && <MostTracked />}
      {widgets.airports && <BusiestAirports />}
      {widgets.bookmarks && <Bookmarks />}
    </div>
  );
}

// ---- Card shell -------------------------------------------------------------

function WidgetCard({
  id,
  title,
  live,
  help,
  children,
  footer,
}: {
  id: WidgetKey;
  title: string;
  live?: boolean;
  help: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(id !== "bookmarks");
  return (
    <section className="shrink-0 overflow-hidden rounded-xl bg-[#2a2b2e]/95 shadow-xl ring-1 ring-black/20 backdrop-blur">
      <header className="flex items-center gap-2 bg-[#38393c] px-3 py-2">
        <h2 className="text-[14px] font-medium text-white">{title}</h2>
        {live && <span className="rounded-[3px] bg-fr-yellow px-1 py-px text-[9.5px] font-bold tracking-wide text-black">LIVE</span>}
        <span title={help} className="text-white/45">
          <CircleHelp size={14} />
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto rounded p-1 text-white/80 hover:bg-white/10"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </header>
      {open && (
        <>
          <div className="space-y-1.5 p-2">{children}</div>
          {footer}
        </>
      )}
    </section>
  );
}

const Badge = ({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "blue" | "outline" }) => (
  <span
    className={`inline-flex items-center rounded-[3px] px-1 text-[10.5px] font-semibold leading-[16px] ${
      tone === "blue" ? "bg-[#2f6aa3] text-white" : tone === "outline" ? "text-white/85 ring-1 ring-white/30" : "bg-[#5a5b5f] text-white"
    }`}
  >
    {children}
  </span>
);

const Row = ({ children, href }: { children: ReactNode; href?: string }) =>
  href ? (
    <Link href={href} className="block rounded-md bg-[#3a3b3f] px-2.5 py-2 transition hover:bg-[#45464a]">
      {children}
    </Link>
  ) : (
    <div className="rounded-md bg-[#3a3b3f] px-2.5 py-2">{children}</div>
  );

const Empty = ({ children }: { children: ReactNode }) => <p className="px-1 py-3 text-center text-sm text-white/50">{children}</p>;

// ---- Most tracked flights ---------------------------------------------------

function MostTracked() {
  const tracked = useStore((s) => s.data?.tracked);
  return (
    <WidgetCard id="tracked" title="Most tracked flights" live help="Flights with the most Flightradar48 viewers right now">
      {!tracked ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      ) : tracked.length === 0 ? (
        <Empty>Nobody is tracking a flight right now. Click an aircraft to be the first!</Empty>
      ) : (
        tracked.slice(0, 3).map((f, i) => <TrackedRow key={f.callsign} rank={i + 1} f={f} />)
      )}
    </WidgetCard>
  );
}

function TrackedRow({ rank, f }: { rank: number; f: TrackedFlight }) {
  return (
    <Row href={`/${encodeURIComponent(f.callsign)}`}>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-medium text-white">
          {rank}. {f.callsign}
        </span>
        {f.flightNumber && <Badge>{f.flightNumber}</Badge>}
        {f.type && <Badge tone="blue">{f.type}</Badge>}
        <span className="ml-auto flex items-center gap-1 text-[14px] font-medium text-fr-yellow tabular">
          {f.viewers.toLocaleString("en-US")}
          <Users size={14} />
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-white/90">
        {f.origin ? (
          <>
            {f.origin.city} <Badge tone="outline">{f.origin.code}</Badge>
          </>
        ) : (
          "—"
        )}
        <span className="text-white/60">–</span>
        {f.destination ? (
          <>
            {f.destination.city} <Badge tone="outline">{f.destination.code}</Badge>
          </>
        ) : (
          "—"
        )}
      </div>
    </Row>
  );
}

// ---- Busiest airports -------------------------------------------------------

function BusiestAirports() {
  const busiest = useStore((s) => s.data?.busiest);
  return (
    <WidgetCard
      id="airports"
      title="Busiest airports"
      live
      help="Airports with the most VATSIM arrivals and departures right now"
      footer={
        <Link href="/data/airports" className="block border-t border-white/5 py-2 text-center text-[13px] text-[#4aa3ff] hover:underline">
          All airports
        </Link>
      }
    >
      {!busiest ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      ) : busiest.length === 0 ? (
        <Empty>No traffic right now.</Empty>
      ) : (
        busiest.slice(0, 3).map((a) => <AirportRow key={a.icao} a={a} />)
      )}
    </WidgetCard>
  );
}

const metarCache = new Map<string, Promise<DecodedMetar | null>>();
function useMetar(icao: string) {
  const [m, setM] = useState<{ icao: string; metar: DecodedMetar | null } | null>(null);
  useEffect(() => {
    let off = false;
    let p = metarCache.get(icao);
    if (!p) {
      p = fetch(`/api/metar/${icao}`)
        .then((r) => r.text())
        .then((t) => (t ? decodeMetar(t) : null))
        .catch(() => null);
      metarCache.set(icao, p);
    }
    p.then((metar) => !off && setM({ icao, metar }));
    return () => {
      off = true;
    };
  }, [icao]);
  return m?.icao === icao ? m.metar : null;
}

const SKY_ICON = { clear: Sun, partly: CloudSun, cloudy: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning, fog: CloudFog };

/** Traffic level dot, standing in for FR24's disruption index. */
const levelColor = (n: number) => (n >= 25 ? "bg-[#ff5a36]" : n >= 10 ? "bg-[#ff9d2e]" : "bg-fr-green");

function AirportRow({ a }: { a: BusyAirport }) {
  const metar = useMetar(a.icao);
  const Sky = metar ? SKY_ICON[metar.sky] : null;
  return (
    <Row href={`/airport/${a.icao}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-white">{a.city}</span>
            <Badge tone="outline">{a.iata || a.icao}</Badge>
          </div>
          <div className="mt-0.5 flex h-5 items-center gap-1.5 text-[13px] text-white/90">
            {metar ? (
              <>
                {Sky && <Sky size={16} className="text-white/85" />}
                {metar.temperature !== null && <span className="tabular">{metar.temperature}°C</span>}
                <span className="h-4 w-px bg-white/25" />
                {metar.windKt !== null && metar.windKt > 0 ? (
                  <span className="flex items-center gap-1 tabular">
                    {metar.windDir !== null && (
                      // Arrow points where the wind blows to
                      <ArrowUp size={13} style={{ transform: `rotate(${metar.windDir + 180}deg)` }} />
                    )}
                    {metar.windDir !== null ? `${metar.windDir}°` : "VRB"} {metar.windKt} kts
                  </span>
                ) : (
                  <span>Calm</span>
                )}
              </>
            ) : (
              <span className="text-white/40">—</span>
            )}
          </div>
        </div>
        <div className="space-y-0.5 text-[14px] font-medium tabular">
          <TrafficCount icon={<ArrivalGlyph />} n={a.arrivals} label="arrivals" />
          <TrafficCount icon={<DepartureGlyph />} n={a.departures} label="departures" />
        </div>
      </div>
    </Row>
  );
}

function TrafficCount({ icon, n, label }: { icon: ReactNode; n: number; label: string }) {
  return (
    <div className="flex items-center justify-end gap-2" title={`${n} ${label}`}>
      <span className="text-white/85">{icon}</span>
      <span className={`h-2 w-2 rounded-full ${levelColor(n)}`} />
      <span className="w-6 text-right text-white">{n}</span>
    </div>
  );
}

const ArrivalGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 21h20" />
    <path d="M3.8 10.8 2 9l2-4.5 1.1.6c.5.3.9.8.9 1.4s.4 1.2.9 1.5L8 8.5l3-6 1 .5a2 2 0 0 1 1.1 1.5l.7 5.4a2 2 0 0 0 1.1 1.5l4.4 2.2c.4.2.8.6 1 1l.6 1c.5.9-.1 2-1.1 2.1l-1.2.2c-.5 0-1-.1-1.4-.3L4.3 11.2a2 2 0 0 1-.5-.4Z" />
  </svg>
);

const DepartureGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 21h20" />
    <path d="M6.4 17 2 12.6l1.5-1.4 2.7 1.2 3.4-3.4-6-4.5 1.9-1.9 8 2.6 3.5-3.5a2 2 0 0 1 2.8 2.8l-3.5 3.5 2.6 8-1.9 1.9-4.5-6-3.4 3.4 1.2 2.7z" />
  </svg>
);

// ---- Bookmarks --------------------------------------------------------------

function Bookmarks() {
  const bookmarks = useStore((s) => s.bookmarks);
  const online = useStore((s) => s.data?.flights);
  const live = new Set(online?.map((f) => f[0]) ?? []);
  return (
    <WidgetCard id="bookmarks" title="Bookmarks" help="Flights and airports you starred. Saved in this browser.">
      {bookmarks.length === 0 ? (
        <Empty>Star a flight or an airport to find it here.</Empty>
      ) : (
        bookmarks.map((b) => {
          const href = b.kind === "flight" ? `/${encodeURIComponent(b.id)}` : `/airport/${b.id}`;
          const isLive = b.kind === "airport" || live.has(b.id);
          return (
            <div key={`${b.kind}:${b.id}`} className="flex items-center gap-2 rounded-md bg-[#3a3b3f] pr-1.5">
              <Link href={href} className={`flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 ${isLive ? "" : "opacity-50"}`}>
                {b.kind === "flight" ? <Plane size={15} className="text-fr-yellow" /> : <MapPin size={15} className="text-[#4aa3ff]" />}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-white">{b.label}</span>
                  <span className="block truncate text-[11px] text-white/60">
                    {b.kind === "flight" && !isLive ? "Not online" : b.sub}
                  </span>
                </span>
              </Link>
              <button onClick={() => toggleBookmark(b)} className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Remove bookmark">
                <X size={16} />
              </button>
            </div>
          );
        })
      )}
    </WidgetCard>
  );
}

export function setWidget(key: WidgetKey, on: boolean, current: Settings["widgets"]) {
  updateSettings({ widgets: { ...current, [key]: on } });
}
