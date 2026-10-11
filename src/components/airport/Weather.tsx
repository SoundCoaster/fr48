"use client";

import { useEffect, useState } from "react";
import { decodeMetar } from "@/lib/metar";

const CAT_COLOR = { VFR: "bg-fr-green", MVFR: "bg-fr-blue", IFR: "bg-fr-red", LIFR: "bg-fuchsia-500" };

export function Weather({ icao, compact = false }: { icao: string; compact?: boolean }) {
  const [state, setState] = useState<{ icao: string; raw: string } | null>(null);
  const raw = state?.icao === icao ? state.raw : null;
  useEffect(() => {
    let off = false;
    fetch(`/api/metar/${icao}`)
      .then((r) => r.text())
      .then((t) => !off && setState({ icao, raw: t }))
      .catch(() => !off && setState({ icao, raw: "" }));
    return () => {
      off = true;
    };
  }, [icao]);

  if (raw === null) return <div className="h-16 animate-pulse rounded-lg bg-white/5" />;
  if (!raw) return <div className="text-xs text-fr-muted">No METAR available.</div>;
  const m = decodeMetar(raw);
  const items: [string, string | null][] = [
    ["Wind", m.wind],
    ["Visibility", m.visibility],
    ["Temp", m.temperature !== null ? `${m.temperature}°C${m.dewpoint !== null ? ` / ${m.dewpoint}°C` : ""}` : null],
    ["QNH", m.qnh],
    ["Clouds", m.clouds],
  ];
  return (
    <div>
      <div className={`grid gap-x-4 gap-y-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`}>
        {items.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fr-muted">{k}</div>
            <div className="text-sm font-medium text-white">{v ?? "—"}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2">
        {m.category && <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${CAT_COLOR[m.category]}`}>{m.category}</span>}
        <p className="font-mono text-[11px] leading-relaxed text-white/60">{m.raw}</p>
      </div>
    </div>
  );
}
