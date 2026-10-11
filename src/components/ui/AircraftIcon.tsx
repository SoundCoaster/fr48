import type { Silhouette } from "@/data/aircraft";
import { silhouettePath } from "@/lib/silhouettes";

export function AircraftIcon({
  silhouette,
  size = 24,
  rotate = 0,
  className = "",
  fill = "currentColor",
}: {
  silhouette: Silhouette;
  size?: number;
  rotate?: number;
  className?: string;
  fill?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={{ transform: `rotate(${rotate}deg)` }} aria-hidden>
      <path d={silhouettePath(silhouette)} fill={fill} />
    </svg>
  );
}
