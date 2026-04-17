"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PrototypeSection from "@/components/landing/PrototypeSection";
import { useEmbedBridge } from "@/hooks/useEmbedBridge";

export default function PanoramaEmbedPage() {
  return (
    <Suspense fallback={null}>
      <PanoramaEmbedInner />
    </Suspense>
  );
}

function PanoramaEmbedInner() {
  const searchParams = useSearchParams();
  const localeParam = searchParams.get("locale");
  const lang: "es" | "en" = localeParam === "es" ? "es" : "en";
  const primary = searchParams.get("primary") ?? undefined;
  const autoResize = searchParams.get("height") === "auto";

  useEmbedBridge({ slug: "panorama", autoResize });

  const style = primary ? ({ ["--gp-primary" as string]: primary } as React.CSSProperties) : undefined;

  return (
    <div style={style}>
      <PrototypeSection lang={lang} />
    </div>
  );
}
