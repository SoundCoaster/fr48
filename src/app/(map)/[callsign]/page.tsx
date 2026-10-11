import { Suspense } from "react";
import { FlightPanel } from "@/components/panels/FlightPanel";

export default function FlightPage({ params }: PageProps<"/[callsign]">) {
  return (
    <Suspense>
      <FlightPanel params={params} />
    </Suspense>
  );
}
