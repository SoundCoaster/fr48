"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { Silhouette } from "@/data/aircraft";
import { AircraftIcon } from "@/components/ui/AircraftIcon";

interface Photo {
  src: string;
  link: string;
  photographer: string;
}

const cache = new Map<string, Photo | null>();

/** Aircraft photo from Planespotters.net (by registration), edge to edge, with a silhouette fallback. */
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
      <div className="relative aspect-[16/10] overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={`${registration} aircraft`} className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-6 text-[11px] text-white">
          <span className="truncate">© {photo.photographer}</span>
          <a href={photo.link} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:text-fr-yellow" aria-label="Photo on Planespotters.net" title="Planespotters.net">
            <ExternalLink size={15} strokeWidth={1.6} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-gradient-to-br from-[#2b3a4a] via-[#1f2a36] to-[#141a21]">
      <AircraftIcon silhouette={silhouette} size={110} rotate={-35} className={`opacity-25 grayscale ${photo === undefined ? "animate-pulse" : ""}`} />
      <div className="absolute bottom-1.5 left-2.5 text-[11px] text-white/50">
        {photo === undefined ? "Loading photo…" : registration ? `No photo available for ${registration}` : airline ? `${airline} · no registration filed` : "No registration filed"}
      </div>
    </div>
  );
}
