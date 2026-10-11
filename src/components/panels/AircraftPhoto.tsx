"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import type { Silhouette } from "@/data/aircraft";
import { AircraftIcon } from "@/components/ui/AircraftIcon";

interface Photo {
  src: string;
  link: string;
  photographer: string;
}

const cache = new Map<string, Photo | null>();

/** Aircraft photo from Planespotters.net (by registration), with a silhouette fallback. */
export function AircraftPhoto({ registration, silhouette, airline }: { registration: string | null; silhouette: Silhouette; airline?: string }) {
  const [loaded, setLoaded] = useState<{ reg: string; photo: Photo | null } | null>(null);
  // undefined = still loading
  const photo: Photo | null | undefined = !registration
    ? null
    : cache.has(registration)
      ? cache.get(registration)
      : loaded?.reg === registration
        ? loaded.photo
        : undefined;

  useEffect(() => {
    if (!registration || cache.has(registration)) return;
    let cancelled = false;
    fetch(`/api/photo?reg=${encodeURIComponent(registration)}`)
      .then((r) => r.json() as Promise<{ photo: Photo | null }>)
      .then((d) => {
        cache.set(registration, d.photo);
        if (!cancelled) setLoaded({ reg: registration, photo: d.photo });
      })
      .catch(() => !cancelled && setLoaded({ reg: registration, photo: null }));
    return () => {
      cancelled = true;
    };
  }, [registration]);

  if (photo) {
    return (
      <a href={photo.link} target="_blank" rel="noreferrer" className="group relative block aspect-[16/9] overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={`${registration} aircraft`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-1.5 pt-6 text-[10px] text-white/85">
          <Camera size={11} />
          <span className="truncate">© {photo.photographer}</span>
          <span className="ml-auto shrink-0 text-white/60">Planespotters.net</span>
        </div>
      </a>
    );
  }

  return (
    <div className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-gradient-to-br from-[#2b3a4a] via-[#1f2a36] to-[#141a21]">
      <div className="absolute inset-0 opacity-[0.07] [background:repeating-linear-gradient(135deg,#fff_0_1px,transparent_1px_14px)]" />
      <AircraftIcon silhouette={silhouette} size={120} rotate={-35} className={`opacity-20 grayscale ${photo === undefined ? "animate-pulse" : ""}`} />
      <div className="absolute bottom-2 left-3 text-[10px] text-white/50">
        {photo === undefined ? "Loading photo…" : registration ? `No photo available for ${registration}` : airline ? `${airline} · no registration filed` : "No registration filed"}
      </div>
    </div>
  );
}
