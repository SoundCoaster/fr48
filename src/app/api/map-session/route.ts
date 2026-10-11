import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Google Map Tiles session for the FR24-style basemap. Styling (no roads,
 * POIs or icons; black borders) is baked into the session; darkening is done
 * client-side with raster paint settings.
 */
const STYLES = [
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#000000" }, { weight: 1 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

interface Session {
  session: string;
  key: string;
  expiry: number;
}

let cached: Session | null = null;

function apiKey(): string | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, string | undefined>;
    if (env.GOOGLE_MAPS_KEY) return env.GOOGLE_MAPS_KEY;
  } catch {
    // not on Cloudflare
  }
  return process.env.GOOGLE_MAPS_KEY;
}

export async function GET(req: Request) {
  const key = apiKey();
  if (!key) return Response.json({ session: null }, { status: 404 });

  const now = Date.now() / 1000;
  if (!cached || cached.key !== key || cached.expiry - now < 86400) {
    // The browser key is referrer-restricted: present our own origin
    const referer = `${new URL(req.url).origin}/`;
    const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json", referer },
      body: JSON.stringify({ mapType: "terrain", language: "en-US", region: "US", layerTypes: ["layerRoadmap"], styles: STYLES }),
    });
    if (!res.ok) {
      console.error("Google createSession failed", res.status, await res.text());
      return Response.json({ session: null }, { status: 502 });
    }
    const data = (await res.json()) as { session: string; expiry: string };
    cached = { session: data.session, key, expiry: +data.expiry };
  }
  return Response.json(cached, { headers: { "cache-control": "public, max-age=3600" } });
}
