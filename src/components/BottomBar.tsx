"use client";

import { CloudSunRain, Filter, LayoutPanelLeft, Settings, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  setState,
  updateFilters,
  updateSettings,
  useStore,
  type MapStyle,
} from "@/lib/client/store";
import { ALTITUDE_STOPS, nf } from "@/lib/format";

export function BottomBar() {
  const panel = useStore((s) => s.panel);
  const filters = useStore((s) => s.filters);
  const nFilters = activeFilterCount(filters);
  const weather = useStore((s) => s.settings.weather);
  // On phones the flight/airport sheet takes the bottom of the screen
  const panelOpen = usePathname() !== "/";
  const toggle = (p: NonNullable<typeof panel>) => setState({ panel: panel === p ? null : p });

  return (
    <>
      {panel && (
        <div className="fr-scroll pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+72px)] left-1/2 z-30 max-h-[calc(100%-150px)] w-[min(420px,calc(100%-24px))] -translate-x-1/2 overflow-y-auto rounded-xl bg-fr-panel shadow-2xl ring-1 ring-white/10">
          {panel === "settings" && <SettingsPanel />}
          {panel === "filters" && <FiltersPanel />}
          {panel === "widgets" && <WidgetsPanel />}
        </div>
      )}

      <div className={`pointer-events-auto absolute bottom-safe-3 left-1/2 z-30 -translate-x-1/2 ${panelOpen ? "hidden sm:flex" : "flex"} items-stretch gap-0.5 rounded-xl bg-[#3a3b3e]/90 px-1.5 py-1 shadow-xl backdrop-blur`}>
        <BarButton icon={<Settings size={22} strokeWidth={1.6} />} label="Settings" active={panel === "settings"} onClick={() => toggle("settings")} />
        <BarButton
          icon={<CloudSunRain size={22} strokeWidth={1.6} />}
          label="Weather"
          active={weather}
          onClick={() => updateSettings({ weather: !weather })}
        />
        <BarButton
          icon={<Filter size={22} strokeWidth={1.6} />}
          label="Filters"
          active={panel === "filters"}
          onClick={() => toggle("filters")}
          badge={nFilters || undefined}
        />
        <BarButton icon={<LayoutPanelLeft size={22} strokeWidth={1.6} />} label="Widgets" active={panel === "widgets"} onClick={() => toggle("widgets")} />
      </div>
    </>
  );
}

function BarButton({ icon, label, onClick, active, badge }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex min-w-[62px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[12px] transition ${
        active ? "text-fr-yellow" : "text-white hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute right-2 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-fr-red px-1 text-[10px] font-bold text-white">{badge}</span>
      )}
    </button>
  );
}

function PanelHeader({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-fr-panel px-4 py-3">
      <h2 className="text-sm font-bold">{title}</h2>
      <div className="flex items-center gap-2">
        {extra}
        <button onClick={() => setState({ panel: null })} className="rounded-full p-1 text-fr-muted hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const STYLE_OPTIONS: { id: MapStyle; label: string; swatch: string }[] = [
  { id: "google", label: "Map", swatch: "linear-gradient(135deg,#55705f 50%,#3e6672 50%)" },
  { id: "voyager", label: "Voyager", swatch: "linear-gradient(135deg,#f7f1e3 50%,#a9cfe0 50%)" },
  { id: "fr24", label: "Terrain", swatch: "linear-gradient(135deg,#3d4a3c 50%,#26343e 50%)" },
  { id: "light", label: "Light", swatch: "linear-gradient(135deg,#f4f4f2 50%,#d5dde4 50%)" },
  { id: "dark", label: "Dark", swatch: "linear-gradient(135deg,#2c2c2c 50%,#151515 50%)" },
  { id: "satellite", label: "Satellite", swatch: "linear-gradient(135deg,#3f5a32 50%,#1d3a5a 50%)" },
];

function SettingsPanel() {
  const s = useStore((st) => st.settings);
  return (
    <div>
      <PanelHeader title="Settings" />
      <div className="space-y-5 p-4">
        <div>
          <Label>Map</Label>
          <div className="grid grid-cols-3 gap-2">
            {STYLE_OPTIONS.map((o) => (
              <button key={o.id} onClick={() => updateSettings({ mapStyle: o.id })} className="text-center text-xs">
                <span
                  className={`mb-1 block h-12 rounded-lg ring-2 ${s.mapStyle === o.id ? "ring-fr-yellow" : "ring-transparent hover:ring-white/30"}`}
                  style={{ background: o.swatch }}
                />
                <span className={s.mapStyle === o.id ? "text-white" : "text-fr-muted"}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Label>Visibility</Label>
          <Toggle label="Callsign labels" checked={s.labels} onChange={(v) => updateSettings({ labels: v })} />
          <Toggle label="Airports" checked={s.airports} onChange={(v) => updateSettings({ airports: v })} />
          <Toggle label="Weather radar" checked={s.weather} onChange={(v) => updateSettings({ weather: v })} />
          <Toggle label="Day / night" checked={s.dayNight} onChange={(v) => updateSettings({ dayNight: v })} />
          <div className="flex items-center justify-between text-sm">
            <span>Aircraft size</span>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={s.iconSize}
              onChange={(e) => updateSettings({ iconSize: +e.target.value })}
              className="w-36 accent-[var(--fr-yellow)]"
            />
          </div>
        </div>
        <div className="space-y-3">
          <Label>Units & time</Label>
          <Segmented label="Altitude" value={s.altitudeUnit} options={[["ft", "Feet"], ["m", "Metres"]]} onChange={(v) => updateSettings({ altitudeUnit: v })} />
          <Segmented label="Speed" value={s.speedUnit} options={[["kt", "Knots"], ["kmh", "km/h"], ["mph", "mph"]]} onChange={(v) => updateSettings({ speedUnit: v })} />
          <Segmented label="Distance" value={s.distanceUnit} options={[["nm", "NM"], ["km", "km"], ["mi", "mi"]]} onChange={(v) => updateSettings({ distanceUnit: v })} />
          <Segmented label="Time" value={s.timeZone} options={[["utc", "UTC"], ["local", "Airport local"]]} onChange={(v) => updateSettings({ timeZone: v })} />
        </div>
      </div>
    </div>
  );
}

function FiltersPanel() {
  const f = useStore((s) => s.filters);
  const n = activeFilterCount(f);
  return (
    <div>
      <PanelHeader
        title="Filters"
        extra={
          n > 0 && (
            <button onClick={() => updateFilters(DEFAULT_FILTERS)} className="text-xs font-semibold text-fr-yellow hover:underline">
              Clear all
            </button>
          )
        }
      />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Airline (ICAO)" placeholder="AFR" value={f.airline} onChange={(v) => updateFilters({ airline: v })} max={3} />
          <TextField label="Aircraft type" placeholder="A320" value={f.aircraft} onChange={(v) => updateFilters({ aircraft: v })} max={4} />
          <TextField label="Airport (ICAO)" placeholder="LFPG" value={f.airport} onChange={(v) => updateFilters({ airport: v })} max={4} />
          <TextField label="Callsign" placeholder="BAW" value={f.callsign} onChange={(v) => updateFilters({ callsign: v })} max={10} />
        </div>
        <div>
          <Label>
            Altitude: {nf.format(f.altMin)} – {f.altMax >= 60000 ? "max" : nf.format(f.altMax)} ft
          </Label>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={60000} step={1000} value={f.altMin} onChange={(e) => updateFilters({ altMin: Math.min(+e.target.value, f.altMax) })} className="flex-1 accent-[var(--fr-yellow)]" />
            <input type="range" min={0} max={60000} step={1000} value={f.altMax} onChange={(e) => updateFilters({ altMax: Math.max(+e.target.value, f.altMin) })} className="flex-1 accent-[var(--fr-yellow)]" />
          </div>
        </div>
        <Segmented
          label="Show"
          value={f.ground}
          options={[["all", "All"], ["air", "Airborne"], ["ground", "On ground"]]}
          onChange={(v) => updateFilters({ ground: v })}
        />
      </div>
    </div>
  );
}

function WidgetsPanel() {
  const data = useStore((s) => s.data);
  const widgets = useStore((s) => s.settings.widgets);
  const { airports, types, airborne } = useMemo(() => {
    const ap = new Map<string, number>();
    const ty = new Map<string, number>();
    let air = 0;
    for (const f of data?.flights ?? []) {
      if (f[7]) ap.set(f[7], (ap.get(f[7]) ?? 0) + 1);
      if (f[8]) ap.set(f[8], (ap.get(f[8]) ?? 0) + 1);
      if (f[6]) ty.set(f[6], (ty.get(f[6]) ?? 0) + 1);
      if (!f[11]) air++;
    }
    const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { airports: top(ap), types: top(ty), airborne: air };
  }, [data]);

  return (
    <div>
      <PanelHeader title="Widgets" />
      <div className="space-y-5 p-4">
        <div className="space-y-3">
          <Label>Show on map</Label>
          <Toggle label="Most tracked flights" checked={widgets.tracked} onChange={(v) => updateSettings({ widgets: { ...widgets, tracked: v } })} />
          <Toggle label="Busiest airports" checked={widgets.airports} onChange={(v) => updateSettings({ widgets: { ...widgets, airports: v } })} />
          <Toggle label="Bookmarks" checked={widgets.bookmarks} onChange={(v) => updateSettings({ widgets: { ...widgets, bookmarks: v } })} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Flights", data?.stats.pilots],
            ["Airborne", airborne],
            ["ATC", data?.stats.controllers],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-white/[0.05] py-2">
              <div className="text-lg font-bold tabular">{v !== undefined ? nf.format(v as number) : "—"}</div>
              <div className="text-[10px] uppercase tracking-wider text-fr-muted">{k}</div>
            </div>
          ))}
        </div>
        <div>
          <Label>Altitude legend</Label>
          <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${ALTITUDE_STOPS.map(([, c]) => c).join(",")})` }} />
          <div className="mt-1 flex justify-between text-[10px] text-fr-muted tabular">
            {ALTITUDE_STOPS.map(([ft]) => (
              <span key={ft}>{ft === 0 ? "0" : `${ft / 1000}k`}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TopList title="Busiest airports" rows={airports} href={(k) => `/airport/${k}`} />
          <TopList title="Top aircraft" rows={types} onClick={(k) => updateFilters({ aircraft: k })} />
        </div>
      </div>
    </div>
  );
}

function TopList({ title, rows, href, onClick }: { title: string; rows: [string, number][]; href?: (k: string) => string; onClick?: (k: string) => void }) {
  return (
    <div>
      <Label>{title}</Label>
      <ol className="space-y-1 text-sm">
        {rows.map(([k, v], i) => (
          <li key={k}>
            {href ? (
              <a href={href(k)} className="flex justify-between rounded px-1 hover:bg-white/5">
                <span>
                  <span className="mr-2 text-fr-muted">{i + 1}</span>
                  {k}
                </span>
                <span className="tabular text-fr-muted">{v}</span>
              </a>
            ) : (
              <button onClick={() => onClick?.(k)} className="flex w-full justify-between rounded px-1 hover:bg-white/5">
                <span>
                  <span className="mr-2 text-fr-muted">{i + 1}</span>
                  {k}
                </span>
                <span className="tabular text-fr-muted">{v}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fr-muted">{children}</div>
);

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-sm">
      {label}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-fr-yellow" : "bg-white/20"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <div className="flex rounded-lg bg-white/[0.07] p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${value === v ? "bg-fr-yellow text-black" : "text-white/75 hover:text-white"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, max }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; max: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-fr-muted">{label}</span>
      <input
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value.toUpperCase().trim())}
        placeholder={placeholder}
        className="w-full rounded-lg bg-white/[0.07] px-3 py-2 text-sm uppercase outline-none ring-1 ring-transparent placeholder:normal-case placeholder:text-white/30 focus:ring-fr-yellow/60"
      />
    </label>
  );
}
