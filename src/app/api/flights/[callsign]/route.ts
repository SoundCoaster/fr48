import { fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

export async function GET(_req: Request, ctx: RouteContext<"/api/flights/[callsign]">) {
  const { callsign } = await ctx.params;
  const cs = decodeURIComponent(callsign).toUpperCase();
  let body: string | null;
  try {
    body = await traffic().flight(cs);
  } catch (e) {
    // Durable Object unavailable: details from the raw feed (no trail / take-off time)
    console.error("flight via Durable Object failed, using fallback", e);
    const { flightDetail } = await import("@/lib/derive");
    const detail = flightDetail(await fallbackStore(), cs);
    body = detail ? JSON.stringify(detail) : null;
  }
  if (!body) return Response.json({ error: "Flight not found" }, { status: 404 });
  return json(body);
}
