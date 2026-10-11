import type { Metadata } from "next";
import { Suspense } from "react";
import { AirportPage } from "@/components/data/AirportPage";
import { traffic } from "@/lib/traffic";
import type { AirportDetail } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/data/airports/[code]">): Promise<Metadata> {
  const { code } = await params;
  const body = await traffic().airport(code.toUpperCase());
  if (!body) return { title: "Airport not found" };
  const a = (JSON.parse(body) as AirportDetail).airport;
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
