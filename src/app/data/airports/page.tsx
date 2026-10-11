import type { Metadata } from "next";
import { AirportIndex } from "@/components/data/AirportIndex";

export const metadata: Metadata = { title: "Airports" };

export default function Page() {
  return <AirportIndex />;
}
