/* eslint-disable @next/next/no-img-element */
import type { Silhouette } from "@/data/aircraft";

export function AircraftIcon({
  silhouette,
  size = 24,
  rotate = 0,
  selected = false,
  className = "",
}: {
  silhouette: Silhouette;
  size?: number;
  rotate?: number;
  selected?: boolean;
  className?: string;
}) {
  return (
    <img
      src={`/aircraft/${silhouette}${selected ? "-sel" : ""}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`inline-block select-none ${className}`}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    />
  );
}
