import { json, traffic } from "@/lib/traffic";

/** Flight history: /api/history?callsign=AFR123 or /api/history?reg=F-HTYM */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const callsign = p.get("callsign")?.trim().toUpperCase();
  const reg = p.get("reg")?.trim().toUpperCase();
  try {
    if (callsign && /^[A-Z0-9]{2,10}$/.test(callsign)) return json(await traffic().history({ callsign }), 30);
    if (reg && /^[A-Z0-9-]{3,10}$/.test(reg)) return json(await traffic().history({ reg }), 30);
  } catch (e) {
    console.error("history failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return Response.json({ error: "callsign or reg required" }, { status: 400 });
}
