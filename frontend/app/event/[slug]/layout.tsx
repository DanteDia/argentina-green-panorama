import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event Map | IndustriesVerified",
  description: "Interactive event map built by AI research agents, every link traced to its source",
};

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
