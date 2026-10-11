"use client";

import { Building2, Loader2, MapPin, Plane, Search as SearchIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { updateFilters } from "@/lib/client/store";
import type { SearchResults } from "@/lib/types";

type Item =
  | { kind: "flight"; key: string; data: SearchResults["flights"][number] }
  | { kind: "airport"; key: string; data: SearchResults["airports"][number] }
  | { kind: "airline"; key: string; data: SearchResults["airlines"][number] };

export function Search({
  className = "",
  variant = "dark",
  autoFocus = false,
  onDone,
}: {
  className?: string;
  variant?: "dark" | "light";
  autoFocus?: boolean;
  /** Called after a result is chosen (e.g. to close the mobile search). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        setResults(await res.json());
        setActive(0);
      } catch {
        // aborted
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const items: Item[] = results && q.trim().length >= 2
    ? [
        ...results.flights.map((d) => ({ kind: "flight" as const, key: `f${d.callsign}`, data: d })),
        ...results.airports.map((d) => ({ kind: "airport" as const, key: `a${d.icao}`, data: d })),
        ...results.airlines.map((d) => ({ kind: "airline" as const, key: `l${d.icao}`, data: d })),
      ]
    : [];

  const choose = (it: Item) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    onDone?.();
    if (it.kind === "flight") router.push(`/${encodeURIComponent(it.data.callsign)}`);
    else if (it.kind === "airport") router.push(`/airport/${it.data.icao}`);
    else {
      updateFilters({ airline: it.data.icao });
      router.push("/");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && items[active]) choose(items[active]);
    else if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    }
  };

  const section = (title: string, kind: Item["kind"]) => {
    const list = items.map((it, i) => [it, i] as const).filter(([it]) => it.kind === kind);
    if (!list.length) return null;
    return (
      <div className="py-1">
        <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fr-muted">{title}</div>
        {list.map(([it, i]) => (
          <button
            key={it.key}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(it)}
            className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-white/[0.07]" : ""}`}
          >
            {it.kind === "flight" && (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fr-yellow/15 text-fr-yellow">
                  <Plane size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {it.data.callsign}
                    {it.data.type && <span className="ml-2 text-xs font-medium text-fr-muted">{it.data.type}</span>}
                  </span>
                  <span className="block truncate text-xs text-fr-muted">
                    {it.data.airline ? `${it.data.airline} · ` : ""}
                    {it.data.origin || "?"} → {it.data.destination || "?"}
                  </span>
                </span>
              </>
            )}
            {it.kind === "airport" && (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fr-blue/15 text-fr-blue">
                  <MapPin size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.data.name}</span>
                  <span className="block truncate text-xs text-fr-muted">
                    {[it.data.iata, it.data.icao].filter(Boolean).join(" / ")} · {[it.data.city, it.data.country].filter(Boolean).join(", ")}
                  </span>
                </span>
              </>
            )}
            {it.kind === "airline" && (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fr-green/15 text-fr-green">
                  <Building2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.data.name}</span>
                  <span className="block truncate text-xs text-fr-muted">
                    {[it.data.iata, it.data.icao].filter(Boolean).join(" / ")} · {it.data.live} live flight{it.data.live === 1 ? "" : "s"}
                  </span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    );
  };

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={box} className={`relative ${className}`}>
      <div
        className={
          variant === "light"
            ? "flex h-9 items-center gap-2.5 rounded-md bg-white px-3 shadow-md ring-2 ring-transparent transition focus-within:ring-fr-yellow"
            : "flex h-9 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 ring-1 ring-white/5 transition focus-within:bg-white/[0.12] focus-within:ring-fr-yellow/60"
        }
      >
        <SearchIcon size={16} className={`shrink-0 ${variant === "light" ? "text-[#8a8d93]" : "text-fr-muted"}`} />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          placeholder="Find flights, airports and more"
          className={`min-w-0 flex-1 bg-transparent outline-none ${
            variant === "light" ? "text-[14px] text-[#1b1c1e] placeholder:text-[#8a8d93]" : "text-sm text-white placeholder:text-fr-muted"
          }`}
          spellCheck={false}
          autoComplete="off"
        />
        {loading && <Loader2 size={14} className="animate-spin text-fr-muted" />}
        {q && !loading && (
          <button onClick={() => setQ("")} className="text-fr-muted hover:text-white" aria-label="Clear search">
            <X size={14} />
          </button>
        )}
        {!q && variant === "light" && (
          <kbd className="grid h-[18px] w-[18px] place-items-center rounded-[3px] border border-[#9a9da3] font-sans text-[11px] text-[#8a8d93]">/</kbd>
        )}
      </div>
      {showDropdown && (
        <div className="fr-scroll absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-xl bg-fr-panel py-1 shadow-2xl ring-1 ring-white/10 sm:min-w-[380px]">
          {items.length === 0 && !loading && <div className="px-4 py-6 text-center text-sm text-fr-muted">No results for “{q}”</div>}
          {section("Live flights", "flight")}
          {section("Airports", "airport")}
          {section("Airlines", "airline")}
        </div>
      )}
    </div>
  );
}
