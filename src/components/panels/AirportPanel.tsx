"use client";

import {
  ChartColumn,
  ChevronDown,
  CircleHelp,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  Loader2,
  MapPin,
  Moon,
  Radio,
  Share,
  Star,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState, type ReactNode } from "react";
import { statusText } from "@/components/airport/Board";
import { Controllers } from "@/components/airport/Controllers";
import { LogoMark } from "@/components/Logo";
import { Flag } from "@/components/ui/Flag";
import { useAirportDetail } from "@/lib/client/data";
import { toggleBookmark, useStore } from "@/lib/client/store";
import { useNow } from "@/lib/client/useNow";
import { fmtTime } from "@/lib/format";
import { decodeMetar, type DecodedMetar } from "@/lib/metar";
import type { AirportDetail, BoardEntry } from "@/lib/types";

type Tab = "general" | "dep" | "arr" | "ground";

export function AirportPanel({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent(use(params).code).toUpperCase();
  const router = useRouter();
  const { data, error, loading } = useAirportDetail(code);
  const [tab, setTab] = useState<Tab>("general");
  const a = data?.airport;

  useEffect(() => {
    if (a) document.title = `${a.name} (${a.iata || a.icao}) | Flightradar48`;
  }, [a]);

  return (
    <aside className="fr-slide-in pointer-events-auto absolute bottom-[72px] left-0 top-0 z-30 flex w-full flex-col overflow-hidden bg-[#2a2b2e] shadow-2xl sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[calc(100%-88px)] sm:w-[320px] sm:rounded-xl">
      {!data || !a ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-fr-muted">
          {loading && !error ? <Loader2 className="animate-spin" /> : <p>Airport {code} not found.</p>}
        </div>
      ) : (
        <>
          <Header data={data} onClose={() => router.push("/")} />
          <div className="fr-scroll flex-1 space-y-1.5 overflow-y-auto bg-[#d5d6d8] p-1.5">
            {tab === "general" && <General data={data} />}
            {tab === "dep" && <LightBoard entries={data.departures} kind="dep" tz={a.tz} />}
            {tab === "arr" && <LightBoard entries={data.arrivals} kind="arr" tz={a.tz} />}
            {tab === "ground" && <LightBoard entries={data.onGround} kind="dep" tz={a.tz} ground />}
          </div>
          <nav className="grid grid-cols-5 bg-[#2a2b2e] text-[11px]">
            <TabButton active={tab === "general"} onClick={() => setTab("general")} icon={<MapPin size={19} strokeWidth={1.6} />} label="General" />
            <TabButton active={tab === "dep"} onClick={() => setTab("dep")} icon={<DepIcon />} label="Departures" />
            <TabButton active={tab === "arr"} onClick={() => setTab("arr")} icon={<ArrIcon />} label="Arrivals" />
            <TabButton active={tab === "ground"} onClick={() => setTab("ground")} icon={<GroundIcon />} label="On ground" />
            <Link
              href={`/data/airports/${(a.iata || a.icao).toLowerCase()}`}
              className="flex flex-col items-center gap-0.5 py-2 text-white/85 hover:text-white"
            >
              <ExternalLink size={19} strokeWidth={1.6} />
              More
            </Link>
          </nav>
        </>
      )}
    </aside>
  );
}

// ---- Header -----------------------------------------------------------------

function Header({ data, onClose }: { data: AirportDetail; onClose: () => void }) {
  const a = data.airport;
  const now = useNow(15000);
  const starred = useStore((s) => s.bookmarks.some((b) => b.kind === "airport" && b.id === a.icao));
  const [shared, setShared] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: a.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 1500);
      }
    } catch {}
  };

  const localTime =
    now === null
      ? "--:--"
      : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: a.tz || "UTC" }).format(now * 1000);
  const localDate =
    now === null ? "" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: a.tz || "UTC" }).format(now * 1000);

  return (
    <header className="px-3 pb-2.5 pt-2.5 text-white">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-[16px] font-medium leading-snug text-fr-yellow">{a.name}</h1>
        <IconButton
          label={starred ? "Remove bookmark" : "Bookmark this airport"}
          onClick={() => toggleBookmark({ kind: "airport", id: a.icao, label: a.name, sub: [a.iata || a.icao, a.city].filter(Boolean).join(" · ") })}
          active={starred}
        >
          <Star size={17} strokeWidth={1.6} fill={starred ? "currentColor" : "none"} />
        </IconButton>
        <IconButton label={shared ? "Link copied" : "Share"} onClick={share} active={shared}>
          <Share size={16} strokeWidth={1.6} />
        </IconButton>
        <IconButton label="Close" onClick={onClose}>
          <X size={19} strokeWidth={1.6} />
        </IconButton>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[13px]">
        <Flag code={a.countryCode} height={12} />
        {[a.iata, a.icao].filter(Boolean).join(" / ")}
      </div>
      <div className="mt-1 flex items-center text-[12.5px] text-white/90">
        <span className="tabular">{localTime} LT</span>
        <span className="mx-1.5 h-3 w-px bg-white/30" />
        <span>{localDate}</span>
        <span className="mx-1.5 h-3 w-px bg-white/30" />
        <span>Elev. {a.elevation.toLocaleString("en-US")} ft</span>
        <span className="ml-auto opacity-80">
          <LogoMark size={15} />
        </span>
      </div>
    </header>
  );
}

function IconButton({ children, label, onClick, active }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-md p-1 transition hover:bg-white/10 ${active ? "text-fr-yellow" : "text-white/90 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2 ${active ? "text-fr-yellow" : "text-white/85 hover:text-white"}`}>
      {icon}
      {label}
    </button>
  );
}

// ---- General tab -------------------------------------------------------------

function General({ data }: { data: AirportDetail }) {
  const a = data.airport;
  return (
    <>
      <AirportPhoto icao={a.icao} name={a.name} />
      <WeatherCard icao={a.icao} tz={a.tz} />
      <Section icon={Radio} title="ATC online" badge={<LiveBadge />} help="VATSIM controllers connected at this airport" defaultOpen={data.controllers.length > 0}>
        <div className="rounded-md bg-[#2a2b2e] p-2">
          <Controllers controllers={data.controllers} />
        </div>
      </Section>
      <Section icon={EventsIcon} title="Latest events" help="Most recent take-offs and landings on VATSIM">
        <LatestEvents data={data} />
      </Section>
      <Section icon={ChartColumn} title="Airport statistics" badge={<LiveBadge />}>
        <Stats data={data} />
      </Section>
      <Section icon={RunwayIcon} title="Airport & runway details">
        <RunwayDetails data={data} />
      </Section>
    </>
  );
}

interface Photo {
  src: string;
  link: string;
  author: string;
  license: string | null;
}
const photoCache = new Map<string, Promise<Photo | null>>();

function AirportPhoto({ icao, name }: { icao: string; name: string }) {
  const [state, setState] = useState<{ icao: string; photo: Photo | null } | null>(null);
  useEffect(() => {
    let off = false;
    let p = photoCache.get(icao);
    if (!p) {
      p = fetch(`/api/airport-photo?${new URLSearchParams({ icao, name })}`)
        .then((r) => r.json() as Promise<{ photo: Photo | null }>)
        .then((d) => d.photo)
        .catch(() => null);
      photoCache.set(icao, p);
    }
    p.then((photo) => !off && setState({ icao, photo }));
    return () => {
      off = true;
    };
  }, [icao, name]);
  const loaded = state?.icao === icao;
  const photo = loaded ? state.photo : null;

  if (loaded && !photo) return null;
  return (
    // Edge to edge, no frame: cancel the body padding around it
    <div className="-mx-1.5 -mt-1.5">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#3a3b3e]">
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={name} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-6 text-[11px] text-white">
              <span className="truncate" title={photo.license ?? undefined}>
                © {photo.author}
              </span>
              <a href={photo.link} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:text-fr-yellow" aria-label="Photo source">
                <ExternalLink size={15} strokeWidth={1.6} />
              </a>
            </div>
          </>
        ) : (
          <div className="h-full w-full animate-pulse" />
        )}
      </div>
    </div>
  );
}

const metarCache = new Map<string, Promise<DecodedMetar | null>>();

function useMetar(icao: string): DecodedMetar | null | undefined {
  const [state, setState] = useState<{ icao: string; m: DecodedMetar | null } | null>(null);
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
    p.then((m) => !off && setState({ icao, m }));
    return () => {
      off = true;
    };
  }, [icao]);
  return state?.icao === icao ? state.m : undefined;
}

const SKY_LABEL = { clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", rain: "Rain", snow: "Snow", storm: "Thunderstorm", fog: "Fog" };

function SkyGlyph({ sky, night }: { sky: DecodedMetar["sky"]; night: boolean }) {
  const p = { size: 32, strokeWidth: 1.4 };
  switch (sky) {
    case "clear":
      return night ? <Moon {...p} /> : <Sun {...p} />;
    case "partly":
      return night ? <CloudMoon {...p} /> : <CloudSun {...p} />;
    case "cloudy":
      return <Cloud {...p} />;
    case "rain":
      return <CloudRain {...p} />;
    case "snow":
      return <CloudSnow {...p} />;
    case "storm":
      return <CloudLightning {...p} />;
    default:
      return <CloudFog {...p} />;
  }
}

function WeatherCard({ icao, tz }: { icao: string; tz: string | null }) {
  const metar = useMetar(icao);
  const now = useNow(60000);
  const [open, setOpen] = useState(false);
  if (metar === null) return null;
  const hour = now === null ? 12 : +new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz || "UTC" }).format(now * 1000);
  const night = hour < 7 || hour >= 20;

  return (
    <div className="space-y-1.5 rounded-md bg-[#c9cacd] p-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        <Tile label="Conditions">
          {metar ? <SkyGlyph sky={metar.sky} night={night} /> : <span className="h-8" />}
          <span className="text-[13px]">{metar ? SKY_LABEL[metar.sky] : "—"}</span>
        </Tile>
        <Tile label="Temperature">
          <span className="flex h-[52px] items-center text-[28px] font-light tabular">{metar?.temperature ?? "—"} °C</span>
        </Tile>
        <Tile label="Wind">
          {metar?.windKt ? (
            <>
              {metar.windDir !== null ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ transform: `rotate(${metar.windDir + 180}deg)` }} aria-hidden>
                  <path d="M12 20V4M6 10l6-6 6 6" />
                </svg>
              ) : (
                <span className="flex h-8 items-center text-[13px]">VRB</span>
              )}
              <span className="text-[13px] tabular">
                {metar.windDir !== null ? `${metar.windDir}° ` : ""}
                {metar.windKt} kts
              </span>
            </>
          ) : (
            <span className="flex h-[52px] items-center text-[15px]">{metar ? "Calm" : "—"}</span>
          )}
        </Tile>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-[14px] text-[#2f7fd1] hover:bg-[#f7f7f7]"
      >
        <CloudSun size={18} strokeWidth={1.5} />
        More weather &amp; METAR
        <ChevronDown size={17} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && metar && (
        <div className="space-y-2 rounded-md bg-white p-3 text-[14px] text-[#333]">
          {[
            ["Visibility", metar.visibility],
            ["Clouds", metar.clouds],
            ["Dew point", metar.dewpoint !== null ? `${metar.dewpoint} °C` : null],
            ["Pressure", metar.qnh],
            ["Flight category", metar.category],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-black/5 pb-1.5">
              <span className="text-[#777]">{k}</span>
              <span className="font-medium">{v ?? "—"}</span>
            </div>
          ))}
          <p className="rounded bg-[#f1f1f2] p-2 font-mono text-[12px] leading-relaxed text-[#444]">{metar.raw}</p>
        </div>
      )}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-[#efeff0] px-1 py-2 text-[#2a2b2e]">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[#555]">{label}</span>
      {children}
    </div>
  );
}

// ---- Collapsible sections ----------------------------------------------------

function Section({
  icon: Icon,
  title,
  badge,
  help,
  children,
  defaultOpen = false,
}: {
  icon: LucideIcon | ((p: { size?: number }) => ReactNode);
  title: string;
  badge?: ReactNode;
  help?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-md bg-[#f2f2f3]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[#2a2b2e] hover:bg-white">
        <span className="text-[#555]">
          <Icon size={20} />
        </span>
        <span className="text-[13px] font-medium uppercase tracking-wide">{title}</span>
        {badge}
        {help && (
          <span title={help} className="text-[#777]">
            <CircleHelp size={14} />
          </span>
        )}
        <ChevronDown size={17} className={`ml-auto text-[#555] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </section>
  );
}

const LiveBadge = () => (
  <span className="rounded-[3px] border border-[#999] px-1 text-[10px] font-medium uppercase tracking-wide text-[#555]">Live</span>
);

function LatestEvents({ data }: { data: AirportDetail }) {
  const events = [
    ...data.arrivals.filter((e) => e.actual).map((e) => ({ e, kind: "arr" as const, t: e.actual! })),
    ...data.departures.filter((e) => e.actual).map((e) => ({ e, kind: "dep" as const, t: e.actual! })),
  ]
    .sort((x, y) => y.t - x.t)
    .slice(0, 10);
  if (!events.length) return <p className="py-3 text-center text-sm text-[#777]">No take-offs or landings recorded yet.</p>;
  return (
    <ul className="divide-y divide-black/5 rounded-md bg-white">
      {events.map(({ e, kind, t }) => {
        const inner = (
          <>
            <span className="text-[#555]">{kind === "arr" ? <ArrIcon size={20} /> : <DepIcon size={20} />}</span>
            <span className="min-w-0 flex-1">
              <b className="font-semibold">{e.flightNumber ?? e.callsign}</b> {kind === "arr" ? "landed from" : "departed to"}{" "}
              {e.airport ? `${e.airport.city || e.airport.name} (${e.airport.iata || e.airport.icao})` : "—"}
            </span>
            <span className="tabular text-[#555]">{fmtTime(t, data.airport.tz)}</span>
          </>
        );
        const cls = "flex items-center gap-3 px-3 py-2 text-[14px] text-[#2a2b2e]";
        return (
          <li key={`${kind}${e.callsign}${t}`}>
            {e.online ? (
              <Link href={`/${encodeURIComponent(e.callsign)}`} className={`${cls} hover:bg-[#f7f7f7]`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Stats({ data }: { data: AirportDetail }) {
  const prefiled = data.departures.filter((e) => !e.online).length + data.arrivals.filter((e) => !e.online).length;
  const items: [string, number][] = [
    ["Inbound flights", data.stats.arrivals],
    ["Outbound flights", data.stats.departures],
    ["Aircraft on ground", data.stats.onGround],
    ["Prefiled flights", prefiled],
    ["ATC positions online", data.controllers.length],
  ];
  return (
    <dl className="grid grid-cols-2 gap-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md bg-white px-3 py-2">
          <dd className="text-[18px] font-medium text-[#2a2b2e] tabular">{v}</dd>
          <dt className="text-[10.5px] uppercase tracking-wide text-[#777]">{k}</dt>
        </div>
      ))}
    </dl>
  );
}

type Runway = [string, string, number, number, string, 0 | 1, number | null];
const runwayChunks = new Map<string, Promise<Record<string, Runway[]>>>();

const SURFACE: Record<string, string> = {
  ASP: "Asphalt", ASPH: "Asphalt", "ASPH-G": "Asphalt", CON: "Concrete", CONC: "Concrete", PEM: "Asphalt/concrete",
  GRS: "Grass", GRASS: "Grass", TURF: "Grass", GRV: "Gravel", GRVL: "Gravel", DIRT: "Dirt", WATER: "Water", BIT: "Bitumen",
};

function RunwayDetails({ data }: { data: AirportDetail }) {
  const a = data.airport;
  const [state, setState] = useState<{ icao: string; runways: Runway[] } | null>(null);
  useEffect(() => {
    let off = false;
    const prefix = a.icao.slice(0, 2);
    let p = runwayChunks.get(prefix);
    if (!p) {
      p = fetch(`/runways/${prefix}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
      runwayChunks.set(prefix, p);
    }
    p.then((chunk) => !off && setState({ icao: a.icao, runways: chunk[a.icao] ?? [] }));
    return () => {
      off = true;
    };
  }, [a.icao]);
  const runways = state?.icao === a.icao ? state.runways : null;

  return (
    <div className="space-y-1.5">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md bg-white p-3 text-[14px]">
        {[
          ["Location", [a.city, a.country].filter(Boolean).join(", ")],
          ["Elevation", `${a.elevation.toLocaleString("en-US")} ft`],
          ["Coordinates", `${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}`],
          ["Time zone", a.tz ?? "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-[#777]">{k}</dt>
            <dd className="font-medium text-[#2a2b2e]">{v}</dd>
          </div>
        ))}
      </dl>
      {runways === null ? (
        <div className="h-12 animate-pulse rounded-md bg-white" />
      ) : runways.length === 0 ? (
        <p className="py-2 text-center text-sm text-[#777]">No runway data.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-md bg-white">
          {runways.map(([le, he, len, wid, surf, lit, hdg]) => (
            <li key={`${le}${he}`} className="flex items-center gap-3 px-3 py-2 text-[14px] text-[#2a2b2e]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#2a2b2e] text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ transform: `rotate(${hdg ?? (parseInt(le, 10) || 0) * 10}deg)` }} aria-hidden>
                  <rect x="9" y="2" width="6" height="20" rx="1" fill="currentColor" />
                  <path d="M12 4v4M12 10v4M12 16v4" stroke="#2a2b2e" strokeWidth="1.2" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{[le, he].filter(Boolean).join(" / ")}</b>
                <span className="block text-[12px] text-[#666]">
                  {SURFACE[surf.toUpperCase()] ?? (surf || "Unknown")}
                  {lit ? " · Lighted" : ""}
                </span>
              </span>
              <span className="text-right text-[13px] tabular">
                {len ? `${len.toLocaleString("en-US")} ft` : "—"}
                {wid ? <span className="block text-[#777]">{wid} ft wide</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Boards (light) ----------------------------------------------------------

const LIGHT_TONE: Record<string, string> = {
  "text-fr-green": "text-[#1f9d55]",
  "text-fr-red": "text-[#d93025]",
  "text-fr-yellow": "text-[#c47f00]",
  "text-fr-blue": "text-[#1a73c9]",
  "text-fr-muted": "text-[#777]",
  "text-white/70": "text-[#555]",
  "text-white/80": "text-[#555]",
};

function LightBoard({ entries, kind, tz, ground }: { entries: BoardEntry[]; kind: "arr" | "dep"; tz: string | null; ground?: boolean }) {
  if (!entries.length) {
    return (
      <p className="rounded-md bg-white py-10 text-center text-sm text-[#777]">
        {ground ? "No aircraft on the ground." : `No ${kind === "arr" ? "arrivals" : "departures"} on VATSIM right now.`}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/5 overflow-hidden rounded-md bg-white">
      {entries.slice(0, 60).map((e) => {
        const s = statusText(e, kind, tz);
        const inner = (
          <>
            <span className="w-12 shrink-0 font-semibold tabular">{fmtTime(e.scheduled, tz)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {e.flightNumber ?? e.callsign}
                <span className="ml-1.5 text-[12px] font-normal text-[#777]">{e.aircraft}</span>
              </span>
              <span className="block truncate text-[12px] text-[#666]">
                {e.airport ? `${kind === "arr" ? "From" : "To"} ${e.airport.city || e.airport.name} (${e.airport.iata || e.airport.icao})` : e.pilot}
              </span>
            </span>
            {!ground && <span className={`shrink-0 text-right text-[12px] font-semibold ${LIGHT_TONE[s.tone] ?? "text-[#555]"}`}>{s.text}</span>}
          </>
        );
        return (
          <li key={`${e.callsign}${e.scheduled}`}>
            {e.online ? (
              <Link href={`/${encodeURIComponent(e.callsign)}`} className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-[#2a2b2e] hover:bg-[#f7f7f7]">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 text-[14px] text-[#2a2b2e] opacity-70">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---- Glyphs ------------------------------------------------------------------

function DepIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 21h20" />
      <path d="m3 15 3.2 1.4c.6.3 1.3.3 1.9 0L21 10c.8-.4 1.1-1.4.6-2.2-.4-.6-1.1-.9-1.8-.7L15 8.5 9 5 7.3 5.6l3.9 4.2-4.1 1.6L4.6 10l-1.6.7 1.8 2.6" />
    </svg>
  );
}

function ArrIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 21h20" />
      <path d="M3.8 10.8 2 9l2-4.5 1.1.6c.5.3.9.8.9 1.4s.4 1.2.9 1.5L8 8.5l3-6 1 .5a2 2 0 0 1 1.1 1.5l.7 5.4a2 2 0 0 0 1.1 1.5l4.4 2.2c.4.2.8.6 1 1l.6 1c.5.9-.1 2-1.1 2.1l-1.2.2c-.5 0-1-.1-1.4-.3L4.3 11.2a2 2 0 0 1-.5-.4Z" />
    </svg>
  );
}

function GroundIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 21h20" />
      <path d="M4 17h14.5c1.4 0 2.5-.9 2.5-2s-1.1-2-2.5-2H14l-4-5H8l2 5H6l-1.5-2H3l1 4z" />
    </svg>
  );
}

function EventsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20h18" />
      <path d="m5 16 2.5-1.5 4 1-3-4.5 1.5-.5 5 4 3.5-1.5c.8-.3 1.6.1 1.8.9.2.7-.2 1.4-.9 1.6L8 19.5z" />
      <path d="M6 3v4M4 5h4M17 4v3M15.5 5.5h3" />
    </svg>
  );
}

function RunwayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2 5 22M15 2l4 20M12 3v2M12 8v2M12 13v2M12 18v3" />
    </svg>
  );
}
