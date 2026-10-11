import { json, traffic } from "@/lib/traffic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(await traffic().search(q.slice(0, 40)), 10);
}
