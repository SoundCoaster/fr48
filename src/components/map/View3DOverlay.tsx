"use client";

import { Box, X } from "lucide-react";
import { useParams } from "next/navigation";
import { setState, useStore } from "@/lib/client/store";
import { fmtAltitude, fmtSpeed } from "@/lib/format";

/** Status strip shown while the 3D chase view is active. */
export function View3DOverlay() {
  const on = useStore((s) => s.view3d);
  const params = useParams<{ callsign?: string }>();
  const cs = params.callsign ? decodeURIComponent(params.callsign).toUpperCase() : null;
  const row = useStore((s) => (cs ? s.data?.flights.find((f) => f[0] === cs) : undefined));
  const settings = useStore((s) => s.settings);
  if (!on || !cs) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[calc(env(safe-area-inset-top)+60px)] z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#2a2b2e]/90 px-3 py-1.5 text-white shadow-xl ring-1 ring-white/10 backdrop-blur sm:top-[60px]">
      <Box size={16} className="text-fr-yellow" />
      <span className="text-[14px] font-medium text-fr-yellow">{cs}</span>
      {row && (
        <span className="hidden gap-3 text-[12px] text-white/85 tabular sm:flex">
          <span>{fmtAltitude(row[4], settings.altitudeUnit)}</span>
          <span>{fmtSpeed(row[5], settings.speedUnit)}</span>
          <span>{Math.round(row[3])}°</span>
        </span>
      )}
      <span className="hidden text-[11px] text-white/50 md:inline">Drag to orbit · scroll to zoom</span>
      <button onClick={() => setState({ view3d: false })} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] hover:bg-white/20">
        Exit 3D <X size={13} />
      </button>
    </div>
  );
}
