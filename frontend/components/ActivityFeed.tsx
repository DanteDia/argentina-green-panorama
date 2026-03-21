"use client";

import { useState, useEffect, useCallback } from "react";
import { CLUSTER_COLORS } from "@/lib/types";

interface ActivityEntry {
  type: "node_added" | "verified" | "verification_failed" | "grey" | "edge_added";
  name: string;
  cluster?: string;
  source?: string;
  time: string;
  from?: string;
  to?: string;
  rel?: string;
}

interface ActivityFeedProps {
  lang: "es" | "en";
  onNodeClick?: (name: string) => void;
}

const t = {
  es: {
    title: "Actividad Reciente",
    empty: "Sin actividad reciente",
    nodeAdded: "Nuevo nodo",
    verified: "Verificado",
    failed: "Verificacion fallida",
    grey: "Revision manual",
    edgeAdded: "Nueva conexion",
    agent: "AI",
    showMore: "Ver mas",
    showLess: "Ver menos",
  },
  en: {
    title: "Recent Activity",
    empty: "No recent activity",
    nodeAdded: "New node",
    verified: "Verified",
    failed: "Verification failed",
    grey: "Manual review",
    edgeAdded: "New connection",
    agent: "AI",
    showMore: "Show more",
    showLess: "Show less",
  },
};

const REL_LABELS: Record<string, Record<string, string>> = {
  es: { funds: "fondea", partners_with: "aliado de", client_of: "cliente de", portfolio: "portfolio", regulates: "regula" },
  en: { funds: "funds", partners_with: "partners", client_of: "client of", portfolio: "portfolio", regulates: "regulates" },
};

function timeAgo(dateStr: string, lang: "es" | "en"): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);

  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return lang === "es" ? "ahora" : "just now";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

export default function ActivityFeed({ lang, onNodeClick }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const labels = t[lang];
  const relLabels = REL_LABELS[lang];

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const visible = expanded ? entries : entries.slice(0, 5);

  return (
    <div className="px-4 py-2 border-t border-zinc-800">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        {labels.title}
      </h3>

      {loading ? (
        <div className="text-xs text-zinc-600 py-2">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-zinc-600 py-2">{labels.empty}</div>
      ) : (
        <div className="space-y-1">
          {visible.map((entry, i) => (
            <div key={`${entry.time}-${i}`} className="flex items-start gap-1.5 text-xs">
              {/* Time */}
              <span className="text-zinc-600 w-6 flex-shrink-0 text-right">
                {timeAgo(entry.time, lang)}
              </span>

              {/* Icon */}
              <span className="flex-shrink-0 mt-0.5">
                {entry.type === "node_added" && (
                  <span className="text-green-400">+</span>
                )}
                {entry.type === "verified" && (
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="#22c55e" className="inline">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                {entry.type === "verification_failed" && (
                  <span className="text-red-400 text-[10px]">x</span>
                )}
                {entry.type === "grey" && (
                  <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
                )}
                {entry.type === "edge_added" && (
                  <span className="text-blue-400 text-[10px]">~</span>
                )}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {entry.type === "edge_added" ? (
                  <span className="text-zinc-400">
                    <button
                      onClick={() => entry.from && onNodeClick?.(entry.from)}
                      className="text-zinc-300 hover:text-white transition"
                    >
                      {entry.from}
                    </button>
                    <span className="text-zinc-600 mx-0.5">{relLabels[entry.rel || "partners_with"] || entry.rel}</span>
                    <button
                      onClick={() => entry.to && onNodeClick?.(entry.to)}
                      className="text-zinc-300 hover:text-white transition"
                    >
                      {entry.to}
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {entry.cluster && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CLUSTER_COLORS[entry.cluster] || "#6b7280" }}
                      />
                    )}
                    <button
                      onClick={() => onNodeClick?.(entry.name)}
                      className="text-zinc-300 hover:text-white transition truncate"
                    >
                      {entry.name}
                    </button>
                    {entry.source === "agent" && (
                      <span className="text-[9px] bg-green-900/50 text-green-400 px-1 rounded flex-shrink-0">
                        {labels.agent}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}

          {entries.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition mt-1"
            >
              {expanded ? labels.showLess : `${labels.showMore} (${entries.length - 5})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
