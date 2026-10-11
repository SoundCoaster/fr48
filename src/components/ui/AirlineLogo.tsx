"use client";

import { useState } from "react";
import type { Airline } from "@/lib/types";

/**
 * Airline logo. Looks for a local asset first (public/airlines/{ICAO}.png),
 * then a public IATA logo CDN, then falls back to a text badge.
 */
type Props = { airline: Airline | null; height?: number; className?: string };

export function AirlineLogo(props: Props) {
  return <Logo key={props.airline?.icao ?? ""} {...props} />;
}

function Logo({ airline, height = 24, className = "" }: Props) {
  const sources = airline
    ? [`/airlines/${airline.icao}.png`, ...(airline.iata ? [`https://pics.avs.io/240/80/${airline.iata}.png`] : [])]
    : [];
  const [idx, setIdx] = useState(0);
  if (!airline || idx >= sources.length) {
    return airline ? (
      <span
        className={`inline-flex items-center justify-center rounded bg-white/10 px-1.5 text-[11px] font-bold tracking-wide text-white/80 ${className}`}
        style={{ height }}
      >
        {airline.icao}
      </span>
    ) : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt={airline.name}
      style={{ height }}
      className={`w-auto object-contain ${className}`}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
