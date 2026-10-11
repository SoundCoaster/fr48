import { USER_AGENT } from "@/lib/constants";

const API = "https://en.wikipedia.org/w/api.php";
const NOT_A_PHOTO = /logo|\.svg|map|icon|flag|locator|diagram|chart|seal|emblem/i;

interface Page {
  title: string;
  fullurl?: string;
  pageimage?: string;
  images?: { title: string }[];
}

async function wiki<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  return res.json() as Promise<T>;
}

const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Airport photo from its Wikipedia article (Wikimedia Commons image, credited). */
export async function GET(req: Request) {
  // Name comes from the client so this route stays free of the airport database
  const params = new URL(req.url).searchParams;
  const icao = params.get("icao")?.toUpperCase() ?? "";
  const name = (params.get("name") ?? "").slice(0, 120);
  if (!/^[A-Z0-9]{3,4}$/.test(icao) || !name) return Response.json({ photo: null }, { status: 400 });
  try {
    const search = await wiki<{ query?: { pages: Page[] } }>({
      action: "query",
      generator: "search",
      gsrsearch: `${name} ${icao}`,
      gsrlimit: "1",
      prop: "pageimages|images|info",
      piprop: "name",
      imlimit: "40",
      inprop: "url",
    });
    const page = search.query?.pages[0];
    if (!page) return Response.json({ photo: null });
    const candidates = [
      ...(page.pageimage ? [`File:${page.pageimage}`] : []),
      ...(page.images ?? []).map((i) => i.title).filter((t) => /\.(jpe?g|png|webp)$/i.test(t)),
    ].filter((t) => !NOT_A_PHOTO.test(t));
    const file = candidates[0];
    if (!file) return Response.json({ photo: null });

    const info = await wiki<{
      query: { pages: { imageinfo?: { thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }[] };
    }>({ action: "query", titles: file, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "800" });
    const ii = info.query.pages[0]?.imageinfo?.[0];
    if (!ii) return Response.json({ photo: null });
    const photo = {
      src: ii.thumburl,
      link: ii.descriptionurl,
      author: strip(ii.extmetadata?.Artist?.value) || "Wikimedia Commons",
      license: strip(ii.extmetadata?.LicenseShortName?.value) || null,
      article: page.fullurl ?? null,
    };
    return Response.json({ photo }, { headers: { "cache-control": "public, max-age=604800" } });
  } catch {
    return Response.json({ photo: null });
  }
}
