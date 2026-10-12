import type { Metadata } from "next";
import { FlightHistory } from "@/components/data/FlightHistory";

export async function generateMetadata({ params }: PageProps<"/data/aircraft/[reg]">): Promise<Metadata> {
  const { reg } = await params;
  return { title: `${decodeURIComponent(reg).toUpperCase()} aircraft history` };
}

export default async function Page({ params }: PageProps<"/data/aircraft/[reg]">) {
  const { reg } = await params;
  return <FlightHistory query={{ reg: decodeURIComponent(reg).toUpperCase() }} />;
}
