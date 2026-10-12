import { json, traffic } from "@/lib/traffic";

/**
 * Playback frames (one per minute).
 *   /api/playback?range=1                  -> {first, last} | null
 *   /api/playback?from=<unix s>&minutes=10 -> {frames: [[t, rows], ...]}
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.has("range")) return json(await traffic().playbackRange(), 30);
  const from = Math.floor(Number(p.get("from")) / 60) * 60;
  const minutes = Math.min(30, Math.max(1, Math.round(Number(p.get("minutes") ?? 10))));
  if (!Number.isFinite(from) || from <= 0) return Response.json({ error: "bad from" }, { status: 400 });
  // Past frames never change: cache them hard once the window is complete
  const complete = from + minutes * 60 < Date.now() / 1000 - 120;
  return json(await traffic().playback(from, minutes), complete ? 86400 : 30);
}
