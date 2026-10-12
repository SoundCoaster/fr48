import { edgeCached, fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 40);
  try {
    return json(await traffic().search(q), 10);
  } catch (e) {
    console.error("search via Durable Object failed, using fallback", e);
    const body = await edgeCached(`search:${q.toUpperCase()}`, 30, async () => {
      const { search } = await import("@/lib/derive");
      return JSON.stringify(search(await fallbackStore(), q));
    });
    return json(body!, 10);
  }
}
