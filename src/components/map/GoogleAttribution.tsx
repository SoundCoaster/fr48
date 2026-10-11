"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { mapInstance } from "./instance";
import { googleSession } from "./styles";

/**
 * Google logo + data providers for the visible area, required when showing
 * Google Map Tiles (copyright text comes from the viewport-info endpoint).
 */
export function GoogleAttribution({ active }: { active: boolean }) {
  const [copyright, setCopyright] = useState("Map data ©Google");
  // Only once a session exists: without one the map falls back to another style
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    googleSession().then((s) => !stopped && setHasSession(!!s));
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const map = mapInstance.current;
        const s = await googleSession();
        if (!map || !s || stopped) return;
        const b = map.getBounds();
        const params = new URLSearchParams({
          session: s.session,
          key: s.key,
          zoom: String(Math.round(map.getZoom())),
          north: String(Math.min(85, b.getNorth())),
          south: String(Math.max(-85, b.getSouth())),
          east: String(Math.min(180, b.getEast())),
          west: String(Math.max(-180, b.getWest())),
        });
        try {
          const res = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${params}`);
          const d = (await res.json()) as { copyright?: string };
          if (!stopped && d.copyright) setCopyright(d.copyright);
        } catch {}
      }, 600);
    };
    update();
    // The map may be created after this component mounts
    const attach = setInterval(() => {
      const map = mapInstance.current;
      if (!map) return;
      clearInterval(attach);
      map.on("moveend", update);
      update();
    }, 300);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(attach);
      mapInstance.current?.off("moveend", update);
    };
  }, [active]);

  if (!active || !hasSession) return null;
  return (
    <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+6px)] left-2 z-10 flex items-end gap-2">
      <img src="https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png" alt="Google" className="h-[18px] w-auto drop-shadow" />
      <span className="max-w-[60vw] truncate rounded-sm bg-black/35 px-1 text-[10px] leading-4 text-white/85">{copyright}</span>
    </div>
  );
}
