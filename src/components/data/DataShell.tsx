"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/TopBar";
import { useLiveFlights } from "@/lib/client/data";

export function DataShell({ children }: { children: ReactNode }) {
  useLiveFlights(30000);
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-40">
        <TopBar />
      </div>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-fr-muted">
        Flightradar48 — live data from the VATSIM network. Not affiliated with Flightradar24 or VATSIM. For flight simulation use only.
      </footer>
    </div>
  );
}
