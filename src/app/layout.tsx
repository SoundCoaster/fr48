import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Flightradar48 - Live VATSIM Flight Tracker",
    template: "%s | Flightradar48",
  },
  description: "Track VATSIM flights in real time on a live map. Flight status, routes, airport arrivals and departures.",
  applicationName: "Flightradar48",
  appleWebApp: { capable: true, title: "Flightradar48", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1b1c1e",
  width: "device-width",
  initialScale: 1,
  // App-like on phones: the map handles pinch-zoom, content runs under the notch
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
