import { json, traffic } from "@/lib/traffic";

export async function GET(_req: Request, ctx: RouteContext<"/api/flights/[callsign]">) {
  const { callsign } = await ctx.params;
  const body = await traffic().flight(decodeURIComponent(callsign).toUpperCase());
  if (!body) return Response.json({ error: "Flight not found" }, { status: 404 });
  return json(body);
}
