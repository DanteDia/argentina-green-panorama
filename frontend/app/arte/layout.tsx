import type { Metadata } from "next";
import "./arte.css";

export const metadata: Metadata = {
  title: "Arte · IndustriesVerified",
  description: "Tu carrera artística, ordenada: convocatorias que te convienen, dossiers listos y todo el seguimiento en un lugar.",
};

export default function ArteLayout({ children }: { children: React.ReactNode }) {
  return <div className="arte min-h-screen">{children}</div>;
}
