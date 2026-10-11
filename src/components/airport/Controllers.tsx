"use client";

import { Radio } from "lucide-react";
import { useState } from "react";
import type { AirportController } from "@/lib/types";

const NAMES: Record<string, string> = { ATIS: "ATIS", DEL: "Delivery", GND: "Ground", TWR: "Tower", APP: "Approach", DEP: "Departure" };

export function Controllers({ controllers }: { controllers: AirportController[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!controllers.length) return <div className="text-xs text-fr-muted">No ATC online at this airport.</div>;
  return (
    <ul className="space-y-1.5">
      {controllers.map((c) => (
        <li key={c.callsign} className="rounded-lg bg-white/[0.04]">
          <button
            onClick={() => setOpen(open === c.callsign ? null : c.callsign)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left"
            disabled={!c.atis?.length}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fr-green/15 text-fr-green">
              {c.facility === "ATIS" && c.atisCode ? <b className="text-xs">{c.atisCode}</b> : <Radio size={14} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {NAMES[c.facility] ?? c.facility} <span className="ml-1 text-xs font-normal text-fr-muted">{c.callsign}</span>
              </span>
              <span className="block truncate text-xs text-fr-muted">
                {c.name}
                {c.rating ? ` · ${c.rating}` : ""}
              </span>
            </span>
            <span className="font-mono text-sm text-fr-yellow">{c.frequency}</span>
          </button>
          {open === c.callsign && c.atis && (
            <p className="px-3 pb-3 font-mono text-[11px] leading-relaxed text-white/70">{c.atis.join(" ")}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
