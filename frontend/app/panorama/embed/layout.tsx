import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Green Panorama | IndustriesVerified",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function PanoramaEmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
