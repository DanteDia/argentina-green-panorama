"use client";

import { use } from "react";
import EventMapShell from "@/components/event/EventMapShell";

// Event configs — maps slug to display info
const EVENT_CONFIGS: Record<string, { name: string; dates: string; location: string }> = {
  "blockchainrio-2026": {
    name: "BlockchainRio 2026",
    dates: "Aug 5-7, 2026",
    location: "Rio de Janeiro, Brazil",
  },
};

export default function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const config = EVENT_CONFIGS[slug];

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

  return (
    <EventMapShell
      slug={slug}
      eventName={config.name}
      eventDates={config.dates}
      eventLocation={config.location}
    />
  );
}
