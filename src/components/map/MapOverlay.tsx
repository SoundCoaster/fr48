"use client";

import { Check, ChevronDown, Menu, Search as SearchIcon, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Search } from "@/components/Search";
import { updateSettings, useStore, type MapStyle } from "@/lib/client/store";
import { nf } from "@/lib/format";
import { STYLE_LABELS } from "./styles";

function useClickOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/** Floating chrome over the live map: centred logo, search, menu and view picker. */
export function MapOverlay() {
  const [mobileSearch, setMobileSearch] = useState(false);
  return (
    <>
      {/* Phones: centred logo, search behind a button, menu on the right (FR24 app layout) */}
      <div className="pointer-events-auto absolute inset-x-3 top-safe-3 z-30 flex h-10 items-center justify-between sm:hidden">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-2">
            <Search variant="light" autoFocus onDone={() => setMobileSearch(false)} className="min-w-0 flex-1" />
            <button onClick={() => setMobileSearch(false)} className="px-1 text-[14px] text-white drop-shadow">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setMobileSearch(true)}
              aria-label="Search"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#3a3b3e]/90 text-white shadow-md backdrop-blur"
            >
              <SearchIcon size={19} />
            </button>
            <Link href="/" aria-label="Flightradar48 home" className="drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              <Logo height={30} />
            </Link>
            <MainMenu />
          </>
        )}
      </div>

      <Link
        href="/"
        aria-label="Flightradar48 home"
        className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] lg:block"
      >
        <Logo height={36} />
      </Link>
      <div className="pointer-events-auto absolute right-3 top-3 z-30 hidden flex-col items-end gap-2 sm:flex">
        <div className="flex items-center gap-2">
          <Search variant="light" className="min-w-0 flex-1 sm:w-[340px] sm:flex-none" />
          <MainMenu />
        </div>
        <ViewPicker />
      </div>
    </>
  );
}

function MainMenu() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const stats = useStore((s) => s.data?.stats);
  const error = useStore((s) => s.error);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="grid h-9 w-9 place-items-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] hover:text-fr-yellow"
        aria-label="Menu"
      >
        {open ? <X size={22} /> : <Menu size={24} />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-60 overflow-hidden rounded-xl bg-fr-panel py-2 shadow-2xl ring-1 ring-white/10">
          <div className="flex items-center gap-2 px-4 pb-3 pt-1 text-xs text-fr-muted">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-fr-red" : "fr-live-dot bg-fr-green"}`} />
            {stats ? (
              <span className="tabular">
                <b className="text-white">{nf.format(stats.pilots)}</b> flights · <b className="text-white">{nf.format(stats.controllers)}</b> ATC on VATSIM
              </span>
            ) : (
              "Connecting to VATSIM…"
            )}
          </div>
          {[
            ["/", "Live flight tracker"],
            ["/data/airports", "Airports"],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-white/5">
              {label}
            </Link>
          ))}
          <a href="https://github.com/SoundCoaster/fr48" target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-sm hover:bg-white/5">
            Source code on GitHub
          </a>
          <p className="border-t border-white/5 px-4 pt-3 text-[11px] leading-relaxed text-fr-muted">
            Live data from the VATSIM network. For flight simulation use only.
          </p>
        </div>
      )}
    </div>
  );
}

const VIEW_ORDER: MapStyle[] = ["voyager", "fr24", "light", "dark", "satellite"];

function ViewPicker() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const style = useStore((s) => s.settings.mapStyle);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full bg-[#3a3b3e]/85 px-3.5 py-1.5 text-[13px] text-white/85 shadow-lg backdrop-blur hover:bg-[#3a3b3e]"
      >
        VIEW <span className="text-fr-yellow">{STYLE_LABELS[style]}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-40 overflow-hidden rounded-xl bg-fr-panel py-1 shadow-2xl ring-1 ring-white/10">
          {VIEW_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => {
                updateSettings({ mapStyle: s });
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-white/5"
            >
              {STYLE_LABELS[s]}
              {s === style && <Check size={16} className="text-fr-yellow" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
