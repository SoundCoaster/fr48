import type { Metadata } from "next";
import { Suspense } from "react";
import { AirportPage } from "@/components/data/AirportPage";
import { airport } from "@/lib/refdata";

export async function generateMetadata({ params }: PageProps<"/data/airports/[code]">): Promise<Metadata> {
  const { code } = await params;
  const a = airport(code);
  if (!a) return { title: "Airport not found" };
  const label = a.iata || a.icao;
  return {
    title: `${a.name} (${label}) Arrivals, Departures & ATC`,
    description: `Live VATSIM arrivals, departures, weather and ATC for ${a.name} (${label}/${a.icao}).`,
  };
}

export default function Page({ params }: PageProps<"/data/airports/[code]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-6xl animate-pulse p-6" />}>
      <AirportPage params={params} />
    </Suspense>
  );
}
