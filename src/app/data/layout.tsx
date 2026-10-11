import { DataShell } from "@/components/data/DataShell";

export default function DataLayout({ children }: LayoutProps<"/data">) {
  return <DataShell>{children}</DataShell>;
}
