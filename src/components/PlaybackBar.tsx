"use client";

import { FastForward, Loader2, Pause, Play, Rewind, X } from "lucide-react";
import { useEffect } from "react";
import { aircraftInfo } from "@/data/aircraft";
import { ensureFrames, fetchRange, frameLoaded, sampleAt } from "@/lib/client/playback";
import { getState, setState, useStore } from "@/lib/client/store";
import { fmtAltitude, fmtSpeed } from "@/lib/format";

const SPEEDS = [1, 10, 30, 60, 120];
const TICK_MS = 100;

const fmtDate = (t: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000);
const fmtClock = (t: number) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(t * 1000);

/** Enter playback mode one hour back (or at the start of the recording). */
export async function startPlayback(): Promise<string | null> {
  const range = await fetchRange();
  if (!range || range.last - range.first < 120) return "History is still being recorded. Come back in a few minutes.";
  const t = Math.max(range.first, range.last - 3600);
  ensureFrames(t);
  setState({ playback: { t, playing: false, speed: 10, first: range.first, last: range.last }, playbackSel: null, panel: null, follow: false });
  return null;
}

/** Timeline controls shown at the bottom of the map in playback mode. */
export function PlaybackBar() {
  const pb = useStore((s) => s.playback);

  // Playback clock
  useEffect(() => {
    if (!pb?.playing) return;
    const timer = setInterval(() => {
      const cur = getState().playback;
      if (!cur) return;
      // Hold the clock while the next frames are loading
      if (!frameLoaded(cur.t + 60)) {
        ensureFrames(cur.t + 60);
        if (cur.t + 60 <= cur.last) return;
      }
      const t = Math.min(cur.last, cur.t + (TICK_MS / 1000) * cur.speed);
      ensureFrames(t);
      setState({ playback: { ...cur, t, playing: t < cur.last } });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [pb?.playing]);

  // The recording keeps growing: refresh the available range
  useEffect(() => {
    if (!pb) return;
    const timer = setInterval(async () => {
      const r = await fetchRange();
      const cur = getState().playback;
      if (r && cur) setState({ playback: { ...cur, first: r.first, last: r.last } });
    }, 60_000);
    return () => clearInterval(timer);
  }, [pb !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pb) return null;
  const seek = (t: number) => {
    const clamped = Math.max(pb.first, Math.min(pb.last, t));
    ensureFrames(clamped);
    setState({ playback: { ...pb, t: clamped } });
  };
  const loading = !frameLoaded(pb.t);

  return (
    <div className="pointer-events-auto absolute bottom-safe-3 left-1/2 z-30 w-[min(640px,calc(100%-24px))] -translate-x-1/2 rounded-xl bg-[#2a2b2e]/95 px-3 pb-2.5 pt-2 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded bg-fr-yellow px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black">PLAYBACK</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[11px] text-white/60">{fmtDate(pb.t)}</div>
          <div className="text-[17px] font-medium tabular">
            {fmtClock(pb.t)} <span className="text-[11px] text-white/60">UTC</span>
          </div>
        </div>
        <button onClick={() => seek(pb.t - 900)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Back 15 minutes" title="−15 min">
          <Rewind size={18} />
        </button>
        <button
          onClick={() => setState({ playback: { ...pb, playing: !pb.playing, t: pb.t >= pb.last ? Math.max(pb.first, pb.last - 3600) : pb.t } })}
          className="grid h-10 w-10 place-items-center rounded-full bg-fr-yellow text-black hover:brightness-110"
          aria-label={pb.playing ? "Pause" : "Play"}
        >
          {loading && pb.playing ? <Loader2 size={18} className="animate-spin" /> : pb.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={() => seek(pb.t + 900)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Forward 15 minutes" title="+15 min">
          <FastForward size={18} />
        </button>
        <button
          onClick={() => setState({ playback: null, playbackSel: null })}
          className="ml-1 flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium hover:bg-white/20"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-fr-red" /> Live <X size={13} />
        </button>
      </div>

      <input
        type="range"
        min={pb.first}
        max={pb.last}
        step={60}
        value={pb.t}
        onChange={(e) => seek(+e.target.value)}
        className="mt-2 w-full accent-[var(--fr-yellow)]"
        aria-label="Playback time"
      />
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-white/50 tabular">
        <span>
          {fmtDate(pb.first)} {fmtClock(pb.first).slice(0, 5)}
        </span>
        <div className="flex gap-0.5 rounded-md bg-white/[0.07] p-0.5">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setState({ playback: { ...pb, speed: sp } })}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${pb.speed === sp ? "bg-fr-yellow text-black" : "text-white/75 hover:text-white"}`}
            >
              {sp}×
            </button>
          ))}
        </div>
        <span>
          {fmtDate(pb.last)} {fmtClock(pb.last).slice(0, 5)}
        </span>
      </div>
    </div>
  );
}

/** Small card for the aircraft selected during playback. */
export function PlaybackFlightCard() {
  const pb = useStore((s) => s.playback);
  const sel = useStore((s) => s.playbackSel);
  const settings = useStore((s) => s.settings);
  if (!pb || !sel) return null;
  const row = sampleAt(pb.t).find((r) => r[0] === sel);
  const type = row ? aircraftInfo(row[6]) : null;
  return (
    <div className="pointer-events-auto absolute left-3 top-[calc(env(safe-area-inset-top)+64px)] z-30 w-[min(300px,calc(100%-24px))] overflow-hidden rounded-xl bg-[#2a2b2e] text-white shadow-2xl sm:top-3">
      <div className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-medium leading-none text-fr-yellow">{sel}</span>
            {type?.code && <span className="rounded-[3px] bg-[#2f5d86] px-1 text-[11px] font-semibold leading-[17px]">{type.code}</span>}
          </div>
          <div className="mt-1 truncate text-[13px] text-white/80">{type?.name ?? "No longer in this frame"}</div>
        </div>
        <button onClick={() => setState({ playbackSel: null })} className="rounded p-0.5 text-white/80 hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      {row && (
        <div className="grid grid-cols-2 gap-px bg-[#d5d6d8] text-[#26272a]">
          {[
            ["Route", row[7] || row[8] ? `${row[7] || "?"} → ${row[8] || "?"}` : "—"],
            ["Altitude", fmtAltitude(row[4], settings.altitudeUnit)],
            ["Ground speed", fmtSpeed(row[5], settings.speedUnit)],
            ["Track", `${Math.round(row[3])}°`],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#f2f2f3] px-3 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-[#6b6c70]">{k}</div>
              <div className="text-[14px] tabular">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
