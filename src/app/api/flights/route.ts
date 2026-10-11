import { json, traffic } from "@/lib/traffic";

export async function GET() {
  return json(await traffic().flights());
}
