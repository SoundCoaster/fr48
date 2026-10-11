import { json, traffic } from "@/lib/traffic";

export async function GET(_req: Request, ctx: RouteContext<"/api/airports/[code]">) {
  const { code } = await ctx.params;
  const body = await traffic().airport(code.toUpperCase());
  if (!body) return Response.json({ error: "Airport not found" }, { status: 404 });
  return json(body, 15);
}
