"use client";

import { useSyncExternalStore } from "react";

/** Current unix time in seconds, re-rendering every `stepMs`. Null during SSR. */
export function useNow(stepMs = 15000): number | null {
  const tick = useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, stepMs);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / stepMs),
    () => null,
  );
  return tick === null ? null : (tick * stepMs) / 1000;
}
