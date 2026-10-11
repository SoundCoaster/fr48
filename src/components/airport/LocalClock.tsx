"use client";

import { useNow } from "@/lib/client/useNow";
import { fmtTime, tzAbbr } from "@/lib/format";

export function LocalClock({ tz }: { tz: string | null }) {
  const now = useNow(10000);
  if (now === null) return <span>--:--</span>;
  return (
    <span className="tabular">
      {fmtTime(now, tz)} <span className="text-fr-muted">{tzAbbr(tz, now)}</span>
    </span>
  );
}
