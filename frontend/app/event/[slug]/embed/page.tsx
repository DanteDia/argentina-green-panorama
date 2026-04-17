"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import EventMapShell from "@/components/event/EventMapShell";
import { EVENT_CONFIGS } from "@/lib/event-configs";
import { useEmbedBridge } from "@/hooks/useEmbedBridge";

export default function EventEmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const config = EVENT_CONFIGS[slug];

  const primary = searchParams.get("primary") ?? undefined;
  const autoResize = searchParams.get("height") === "auto";

  useEmbedBridge({ slug, autoResize });

  if (!config) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-white text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-white/60">No event map found for &quot;{slug}&quot;</p>
        </div>
      </div>
    );
  }

  const style = primary ? ({ ["--gp-primary" as string]: primary } as React.CSSProperties) : undefined;

  return (
    <div style={style}>
      <EventMapShell
        slug={slug}
        eventName={config.name}
        eventDates={config.dates}
        eventLocation={config.location}
      />
    </div>
  );
}
