"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useLiveFlights } from "@/lib/client/data";
import { BottomBar } from "./BottomBar";
import { MapControls } from "./map/MapControls";
import { MapOverlay } from "./map/MapOverlay";
import { View3DOverlay } from "./map/View3DOverlay";
import { WidgetsColumn } from "./widgets/WidgetsColumn";

const LiveMap = dynamic(() => import("./map/LiveMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#e9edf0]" />,
});

/** Reads the selection from the URL; params are request-time data, so this lives under Suspense. */
function SelectedMap() {
  const params = useParams<{ callsign?: string; code?: string }>();
  const selected = params.callsign ? decodeURIComponent(params.callsign).toUpperCase() : null;
  const airport = params.code ? decodeURIComponent(params.code).toUpperCase() : null;
  return <LiveMap selected={selected} selectedAirport={airport} />;
}

export function MapShell({ children }: { children: ReactNode }) {
  useLiveFlights();

  return (
    <div className="fixed inset-0 overflow-hidden">
      <main className="relative h-full overflow-hidden">
        <Suspense fallback={<div className="absolute inset-0 bg-[#e9edf0]" />}>
          <SelectedMap />
        </Suspense>
        <div className="pointer-events-none absolute inset-0">
          <MapOverlay />
          <Suspense>
            <WidgetsColumn />
          </Suspense>
          {children}
          <MapControls />
          <BottomBar />
          <Suspense>
            <View3DOverlay />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
