import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event Map | IndustriesVerified",
  description: "Interactive event map powered by AI research agents and blockchain verification",
};

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
