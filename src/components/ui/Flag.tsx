/* eslint-disable @next/next/no-img-element */

/** Country flag from an ISO 3166-1 alpha-2 code (flagcdn.com). */
export function Flag({ code, height = 14, className = "" }: { code: string | null | undefined; height?: number; className?: string }) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const c = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/h40/${c}.png`}
      alt={code.toUpperCase()}
      height={height}
      style={{ height, width: "auto" }}
      className={`inline-block rounded-[2px] ${className}`}
    />
  );
}

export const flagUrl = (code: string) => `https://flagcdn.com/h40/${code.toLowerCase()}.png`;
