import { Suspense } from "react";
import { AirportPanel } from "@/components/panels/AirportPanel";

export default function AirportMapPage({ params }: PageProps<"/airport/[code]">) {
  return (
    <Suspense>
      <AirportPanel params={params} />
    </Suspense>
  );
}
