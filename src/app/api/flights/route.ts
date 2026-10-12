import { fallbackFlights } from "@/lib/fallback";
import { json, traffic } from "@/lib/traffic";

export async function GET() {
  try {
    return json(await traffic().flights());
  } catch (e) {
    // Durable Object unavailable (quota, outage): keep the map alive from the raw feed
    console.error("flights via Durable Object failed, using fallback", e);
    return json(await fallbackFlights());
  }
}
