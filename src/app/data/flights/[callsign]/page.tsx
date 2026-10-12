import type { Metadata } from "next";
import { FlightHistory } from "@/components/data/FlightHistory";

export async function generateMetadata({ params }: PageProps<"/data/flights/[callsign]">): Promise<Metadata> {
  const { callsign } = await params;
  return { title: `${decodeURIComponent(callsign).toUpperCase()} flight history` };
}

export default async function Page({ params }: PageProps<"/data/flights/[callsign]">) {
  const { callsign } = await params;
  return <FlightHistory query={{ callsign: decodeURIComponent(callsign).toUpperCase() }} />;
}
