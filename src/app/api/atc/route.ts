import { fallbackStore } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

/** Online ATC stations resolved to FIRs, TRACONs and airports. */
export async function GET() {
  try {
    return json(await traffic().atc(), 30);
  } catch (e) {
    console.error("atc via Durable Object failed, using fallback", e);
    const { atcStations } = await import("@/lib/atc");
    return json(JSON.stringify(atcStations(await fallbackStore())), 30);
  }
}
