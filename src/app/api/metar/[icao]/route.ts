export async function GET(_req: Request, ctx: RouteContext<"/api/metar/[icao]">) {
  const { icao } = await ctx.params;
  if (!/^[A-Z0-9]{4}$/i.test(icao)) return new Response("", { status: 400 });
  const res = await fetch(`https://metar.vatsim.net/${icao.toUpperCase()}`);
  const text = res.ok ? (await res.text()).trim() : "";
  return new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
