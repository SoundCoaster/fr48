"use client";

import Link from "next/link";
import { useState } from "react";
import { useAirportRows } from "@/lib/client/data";

export function AirportIndex() {
  const { data } = useAirportRows();
  const [q, setQ] = useState("");
  const query = q.trim().toUpperCase();
  const rows = (data ?? [])
    .filter((r) => r[6] + r[7] > 0)
    .filter((r) => !query || r[0].includes(query) || r[1].includes(query) || r[2].toUpperCase().includes(query))
    .sort((a, b) => b[6] + b[7] - (a[6] + a[7]))
    .slice(0, 100);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Busiest airports on VATSIM right now</h1>
      <p className="mt-1 text-sm text-fr-muted">Ranked by connected flights filed to or from each airport.</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by name or code"
        className="mt-5 w-full rounded-lg bg-white/[0.07] px-4 py-2.5 text-sm outline-none ring-1 ring-transparent focus:ring-fr-yellow/60"
      />
      <div className="mt-4 overflow-hidden rounded-xl bg-fr-panel">
        <table className="w-full text-left text-sm tabular">
          <thead className="text-[10px] uppercase tracking-wider text-fr-muted">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="py-2">Airport</th>
              <th className="py-2 text-right">Arrivals</th>
              <th className="px-4 py-2 text-right">Departures</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r[0]} className="border-t border-white/5 hover:bg-white/[0.04]">
                <td className="px-4 py-2 text-fr-muted">{i + 1}</td>
                <td className="py-2">
                  <Link href={`/data/airports/${(r[1] || r[0]).toLowerCase()}`} className="block">
                    <span className="font-semibold">{r[2]}</span>
                    <span className="ml-2 text-xs text-fr-muted">{[r[1], r[0]].filter(Boolean).join(" / ")}</span>
                  </Link>
                </td>
                <td className="py-2 text-right">{r[6]}</td>
                <td className="px-4 py-2 text-right">{r[7]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data && <div className="h-40 animate-pulse" />}
      </div>
    </div>
  );
}
