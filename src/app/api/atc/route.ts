import { edgeCached, fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

/** Online ATC stations resolved to FIRs, TRACONs and airports. */
export async function GET() {
  try {
    return json(await traffic().atc(), 30);
  } catch (e) {
    console.error("atc via Durable Object failed, using fallback", e);
    const body = await edgeCached("atc", 60, async () => {
      const { atcStations } = await import("@/lib/atc");
      return JSON.stringify(atcStations(await fallbackStore()));
    });
    return json(body!, 30);
  }
}
