"use client";

interface EventHeaderProps {
  eventName: string;
  eventDates: string;
  eventLocation: string;
  isMobile?: boolean;
  onMenuToggle?: () => void;
}

export default function EventHeader({ eventName, eventDates, eventLocation, isMobile = false, onMenuToggle }: EventHeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-[#0f172a] border-b border-white/10 z-50 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isMobile && onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="text-white/80 hover:text-white p-1 -ml-1 flex-shrink-0"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <span className="text-white font-bold text-sm truncate">{eventName}</span>
        {!isMobile && (
          <>
            <span className="text-white/40">|</span>
            <span className="text-white/60 text-xs">{eventLocation}</span>
            <span className="text-white/40">|</span>
            <span className="text-white/60 text-xs">{eventDates}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        {!isMobile && (
          <>
            <span className="text-white/50 text-xs">Powered by</span>
            <span className="text-white font-semibold text-xs">IndustriesVerified</span>
            <span className="text-white/30">|</span>
          </>
        )}
        <span className="text-emerald-400 text-xs">
          {isMobile ? "GenLayer" : "Verified by GenLayer"}
        </span>
      </div>
    </div>
  );
}
