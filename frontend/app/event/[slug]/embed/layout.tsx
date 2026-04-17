import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Event Map | IndustriesVerified",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
