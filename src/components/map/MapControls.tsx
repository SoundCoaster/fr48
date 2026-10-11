"use client";

import { Maximize2, Minimize2, Minus, Navigation, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { mapInstance } from "./instance";

/** Round zoom / fullscreen / locate buttons on the right edge, FR24 style. */
export function MapControls() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
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
        onClick={() =>
          navigator.geolocation?.getCurrentPosition((p) =>
            mapInstance.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 8 }),
          )
        }
      >
        <Navigation size={17} strokeWidth={1.6} />
      </RoundButton>
    </div>
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
