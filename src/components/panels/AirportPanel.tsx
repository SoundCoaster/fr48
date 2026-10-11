"use client";

import { ArrowRight, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Board } from "@/components/airport/Board";
import { Controllers } from "@/components/airport/Controllers";
import { LocalClock } from "@/components/airport/LocalClock";
import { Weather } from "@/components/airport/Weather";
import { useAirportDetail } from "@/lib/client/data";

export function AirportPanel({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent(use(params).code).toUpperCase();
  const router = useRouter();
  const { data, error, loading } = useAirportDetail(code);
  const [tab, setTab] = useState<"arr" | "dep">("arr");
  const a = data?.airport;

  useEffect(() => {
    if (a) document.title = `${a.name} (${a.iata || a.icao}) | Flightradar48`;
  }, [a]);

  return (
    <aside className="fr-slide-in pointer-events-auto absolute bottom-[64px] left-0 top-0 z-20 flex w-full flex-col overflow-hidden bg-fr-panel shadow-2xl sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[calc(100%-80px)] sm:w-[372px] sm:rounded-xl">
      {!data || !a ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-fr-muted">
          {loading && !error ? <Loader2 className="animate-spin" /> : <p>Airport {code} not found.</p>}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 bg-fr-bg px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold leading-tight">{a.name}</h1>
              <div className="text-[13px] text-fr-muted">
                <span className="font-semibold text-fr-yellow">{[a.iata, a.icao].filter(Boolean).join(" / ")}</span>
                {" · "}
                {[a.city, a.country].filter(Boolean).join(", ")}
              </div>
            </div>
            <button onClick={() => router.push("/")} className="-mr-1 rounded-full p-1.5 text-fr-muted hover:bg-white/10 hover:text-white" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="fr-scroll flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-px bg-white/5 text-center">
              {[
                ["Arrivals", data.stats.arrivals],
                ["Departures", data.stats.departures],
                ["On ground", data.stats.onGround],
              ].map(([k, v]) => (
                <div key={k} className="bg-fr-panel-2 py-3">
                  <div className="text-xl font-bold tabular">{v}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{k}</div>
                </div>
              ))}
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fr-muted">Local time</span>
                <LocalClock tz={a.tz} />
              </div>
              <div>
                <h2 className="mb-2 text-[13px] font-semibold">Weather</h2>
                <Weather icao={a.icao} compact />
              </div>
              <div>
                <h2 className="mb-2 text-[13px] font-semibold">ATC online</h2>
                <Controllers controllers={data.controllers} />
              </div>
            </div>

            <div className="sticky top-0 z-10 flex border-y border-white/5 bg-fr-panel text-sm font-semibold">
              {(["arr", "dep"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 border-b-2 py-2.5 ${tab === t ? "border-fr-yellow text-white" : "border-transparent text-fr-muted hover:text-white"}`}
                >
                  {t === "arr" ? `Arrivals (${data.arrivals.length})` : `Departures (${data.departures.length})`}
                </button>
              ))}
            </div>
            <Board entries={tab === "arr" ? data.arrivals : data.departures} kind={tab} tz={a.tz} compact limit={30} />
          </div>

          <Link
            href={`/data/airports/${(a.iata || a.icao).toLowerCase()}`}
            className="flex items-center justify-center gap-2 border-t border-white/5 bg-fr-bg py-3 text-sm font-semibold text-fr-yellow hover:bg-white/5"
          >
            Full airport page <ArrowRight size={16} />
          </Link>
        </>
      )}
    </aside>
  );
}
