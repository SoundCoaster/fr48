/* eslint-disable @next/next/no-img-element */

/** Brand wordmark (white + yellow on transparent, 1124×269). */
export function Logo({ height = 30, className = "" }: { height?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Flightradar48"
      width={Math.round((height * 1124) / 269)}
      height={height}
      className={`block select-none ${className}`}
      draggable={false}
    />
  );
}

/** Radar mark only, cropped from the wordmark. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <img src="/logo-mark.png" alt="" width={size} height={size} className={`block select-none ${className}`} draggable={false} />;
}
