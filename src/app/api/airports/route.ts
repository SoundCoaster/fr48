import { edgeCached, fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

export async function GET() {
  try {
    return json(await traffic().airports(), 60);
  } catch (e) {
    console.error("airports via Durable Object failed, using fallback", e);
    const body = await edgeCached("airports", 120, async () => {
      const { airportRows } = await import("@/lib/derive");
      return JSON.stringify(airportRows(await fallbackStore()));
    });
    return json(body!, 60);
  }
}
