"use client";

import { Loader2, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { Board } from "@/components/airport/Board";
import { Controllers } from "@/components/airport/Controllers";
import { LocalClock } from "@/components/airport/LocalClock";
import { Weather } from "@/components/airport/Weather";
import { useAirportDetail } from "@/lib/client/data";

type Tab = "arr" | "dep" | "ground";

export function AirportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { data, loading } = useAirportDetail(code.toUpperCase());
  const [tab, setTab] = useState<Tab>("arr");

  if (!data) {
    return (
      <div className="grid h-64 place-items-center text-fr-muted">
        {loading ? <Loader2 className="animate-spin" /> : <p>Airport “{code.toUpperCase()}” not found.</p>}
      </div>
    );
  }
  const a = data.airport;
  const tabs: [Tab, string, number][] = [
    ["arr", "Arrivals", data.arrivals.length],
    ["dep", "Departures", data.departures.length],
    ["ground", "On ground", data.onGround.length],
  ];

  return (
    <div>
      <section className="border-b border-white/5 bg-gradient-to-b from-[#26282c] to-fr-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-6 px-4 py-8">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-sm font-semibold text-fr-yellow">{[a.iata, a.icao].filter(Boolean).join(" / ")}</div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{a.name}</h1>
            <p className="mt-1 text-fr-muted">
              {[a.city, a.country].filter(Boolean).join(", ")} · Elevation {a.elevation.toLocaleString("en-US")} ft
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fr-muted">Local time</div>
            <div className="text-2xl font-bold">
              <LocalClock tz={a.tz} />
            </div>
          </div>
          <Link
            href={`/airport/${a.icao}`}
            className="flex items-center gap-2 rounded-full bg-fr-yellow px-4 py-2 text-sm font-semibold text-black hover:bg-fr-yellow-dark"
          >
            <MapIcon size={16} /> View on map
          </Link>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 overflow-hidden rounded-xl bg-fr-panel">
          <div className="flex border-b border-white/5 text-sm font-semibold">
            {tabs.map(([t, label, n]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-5 py-3 ${tab === t ? "border-fr-yellow text-white" : "border-transparent text-fr-muted hover:text-white"}`}
              >
                {label} <span className="ml-1 text-xs text-fr-muted">{n}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            {tab === "ground" ? (
              <Board entries={data.onGround} kind="dep" tz={a.tz} />
            ) : (
              <Board entries={tab === "arr" ? data.arrivals : data.departures} kind={tab} tz={a.tz} />
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/5 text-center">
            {[
              ["Inbound", data.stats.arrivals],
              ["Outbound", data.stats.departures],
              ["On ground", data.stats.onGround],
            ].map(([k, v]) => (
              <div key={k} className="bg-fr-panel py-3">
                <div className="text-xl font-bold tabular">{v}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{k}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-fr-panel p-4">
            <h2 className="mb-3 text-sm font-bold">Weather</h2>
            <Weather icao={a.icao} compact />
          </div>
          <div className="rounded-xl bg-fr-panel p-4">
            <h2 className="mb-3 text-sm font-bold">ATC online</h2>
            <Controllers controllers={data.controllers} />
          </div>
        </aside>
      </div>
    </div>
  );
}
