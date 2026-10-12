"use client";

import { Loader2, Maximize2, Minimize2, Minus, Navigation, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Marker } from "maplibre-gl";
import { mapInstance } from "./instance";

let meMarker: Marker | null = null;

/** Centre the map on the device position and show it as a blue dot. */
function locate(setBusy: (b: boolean) => void) {
  if (!navigator.geolocation) return;
  setBusy(true);
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      setBusy(false);
      const map = mapInstance.current;
      if (!map) return;
      const at: [number, number] = [p.coords.longitude, p.coords.latitude];
      map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 9) });
      // maplibre-gl touches `window`, so load it only in the browser
      const { Marker } = await import("maplibre-gl");
      if (!meMarker) {
        const el = document.createElement("div");
        el.className = "fr-me";
        meMarker = new Marker({ element: el });
      }
      meMarker.setLngLat(at).addTo(map);
    },
    () => setBusy(false),
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
  );
}

/** Round zoom / fullscreen / locate buttons on the right edge, FR24 style. */
export function MapControls() {
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  // On phones the flight/airport sheet covers the bottom of the screen
  const panelOpen = usePathname() !== "/";
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <>
    <div className="pointer-events-auto absolute right-3 top-[100px] z-20 hidden flex-col gap-2 sm:flex">
      <RoundButton label="Zoom in" onClick={() => mapInstance.current?.zoomIn()}>
        <Plus size={20} strokeWidth={1.6} />
      </RoundButton>
      <RoundButton label="Zoom out" onClick={() => mapInstance.current?.zoomOut()}>
        <Minus size={20} strokeWidth={1.6} />
      </RoundButton>
      <RoundButton
        label={full ? "Exit full screen" : "Full screen"}
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
      >
        {full ? <Minimize2 size={17} strokeWidth={1.6} /> : <Maximize2 size={17} strokeWidth={1.6} />}
      </RoundButton>
      <RoundButton
        label="My location"
        onClick={() => locate(setBusy)}
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Navigation size={17} strokeWidth={1.6} />}
      </RoundButton>
    </div>
    {/* Phones: locate button above the bottom bar */}
    {!panelOpen && (
      <div className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+76px)] right-3 z-20 sm:hidden">
        <RoundButton label="My location" onClick={() => locate(setBusy)}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} strokeWidth={1.6} />}
        </RoundButton>
      </div>
    )}
    </>
  );
}

function RoundButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full bg-[#3a3b3e]/90 text-white shadow-md backdrop-blur transition hover:bg-[#4a4b4f]"
    >
      {children}
    </button>
  );
}
