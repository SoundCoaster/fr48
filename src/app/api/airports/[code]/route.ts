import { edgeCached, fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

export async function GET(_req: Request, ctx: RouteContext<"/api/airports/[code]">) {
  const { code } = await ctx.params;
  let body: string | null;
  try {
    body = await traffic().airport(code.toUpperCase());
  } catch (e) {
    console.error("airport via Durable Object failed, using fallback", e);
    body = await edgeCached(`airport:${code.toUpperCase()}`, 30, async () => {
      const { airportDetail } = await import("@/lib/derive");
      const detail = airportDetail(await fallbackStore(), code.toUpperCase());
      return detail ? JSON.stringify(detail) : null;
    });
  }
  if (!body) return Response.json({ error: "Airport not found" }, { status: 404 });
  return json(body, 15);
}
