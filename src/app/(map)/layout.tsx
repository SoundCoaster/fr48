import { MapShell } from "@/components/MapShell";

export default function MapLayout({ children }: LayoutProps<"/">) {
  return <MapShell>{children}</MapShell>;
}
