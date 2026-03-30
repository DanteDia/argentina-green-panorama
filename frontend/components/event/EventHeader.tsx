"use client";

interface EventHeaderProps {
  eventName: string;
  eventDates: string;
  eventLocation: string;
}

export default function EventHeader({ eventName, eventDates, eventLocation }: EventHeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-[#0f172a] border-b border-white/10 z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <span className="text-white font-bold text-sm">{eventName}</span>
        <span className="text-white/40">|</span>
        <span className="text-white/60 text-xs">{eventLocation}</span>
        <span className="text-white/40">|</span>
        <span className="text-white/60 text-xs">{eventDates}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-white/50 text-xs">Powered by</span>
        <span className="text-white font-semibold text-xs">IndustriesVerified</span>
        <span className="text-white/30">|</span>
        <span className="text-emerald-400 text-xs">Verified by GenLayer</span>
      </div>
    </div>
  );
}
