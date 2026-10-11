import { USER_AGENT } from "@/lib/constants";

interface PlanespottersPhoto {
  link: string;
  photographer: string;
  thumbnail: { src: string };
  thumbnail_large: { src: string };
}

/** Aircraft photo by registration, from the Planespotters.net public API (attribution required). */
export async function GET(req: Request) {
  const reg = new URL(req.url).searchParams.get("reg")?.toUpperCase() ?? "";
  if (!/^[A-Z0-9-]{3,10}$/.test(reg)) return Response.json({ photo: null }, { status: 400 });
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`, {
      headers: { "user-agent": USER_AGENT },
    });
    const data = res.ok ? ((await res.json()) as { photos?: PlanespottersPhoto[] }) : {};
    const p = data.photos?.[0];
    const photo = p
      ? { src: p.thumbnail_large?.src ?? p.thumbnail.src, link: p.link, photographer: p.photographer }
      : null;
    return Response.json({ photo }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch {
    return Response.json({ photo: null });
  }
}
