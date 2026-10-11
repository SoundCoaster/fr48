"use client";

import Link from "next/link";
import { useStore } from "@/lib/client/store";
import { nf } from "@/lib/format";
import { Logo } from "./Logo";
import { Search } from "./Search";

export function TopBar() {
  const stats = useStore((s) => s.data?.stats);
  const error = useStore((s) => s.error);

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 bg-fr-bg px-3 shadow-[0_1px_0_rgba(255,255,255,0.06)] sm:gap-5 sm:px-4">
      <Link href="/" aria-label="Flightradar48 home" className="shrink-0">
        <Logo />
      </Link>
      <nav className="hidden items-center gap-1 text-[13px] font-medium text-fr-muted lg:flex">
        <Link href="/" className="rounded-md px-2.5 py-1.5 text-white hover:bg-white/5">
          Live
        </Link>
        <Link href="/data/airports" className="rounded-md px-2.5 py-1.5 hover:bg-white/5 hover:text-white">
          Airports
        </Link>
      </nav>
      <Search className="min-w-0 flex-1 sm:max-w-md" />
      <div className="ml-auto hidden items-center gap-4 md:flex">
        <div className="flex items-center gap-2 text-xs text-fr-muted" title="Data from the VATSIM network">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-fr-red" : "fr-live-dot bg-fr-green"}`} />
          {stats ? (
            <span className="tabular">
              <b className="font-semibold text-white">{nf.format(stats.pilots)}</b> flights ·{" "}
              <b className="font-semibold text-white">{nf.format(stats.controllers)}</b> ATC
            </span>
          ) : (
            <span>Connecting to VATSIM…</span>
          )}
        </div>
        <a
          href="https://github.com/SoundCoaster/fr48"
          target="_blank"
          rel="noreferrer"
          className="text-fr-muted hover:text-white"
          aria-label="Source code on GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
