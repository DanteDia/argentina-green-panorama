"use client";

import { useState, useRef } from "react";
import { BLOCKCHAIN_CLUSTER_COLORS } from "@/lib/event-types";

interface SynergyMatch {
  nodeId: string;
  name: string;
  cluster: string;
  synergyType: string;
  score: number;
  reasoning: string;
  actionItems: string[];
  existingRelationship?: boolean;
  intelSignal?: string;
}

interface OpportunityPanelProps {
  slug: string;
  onHighlightNode?: (nodeId: string) => void;
  onHighlightNodes?: (nodeIds: string[]) => void;
  isMobile?: boolean;
}

const SYNERGY_LABELS: Record<string, string> = {
  existing_relationship: "Already Connected",
  potential_client: "Potential Client",
  potential_partner: "Partner",
  investor_match: "Investor Match",
  talent_pipeline: "Talent",
  technology_complement: "Tech Complement",
  market_expansion: "Market Expansion",
};

const SYNERGY_COLORS: Record<string, string> = {
  existing_relationship: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  potential_client: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  potential_partner: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  investor_match: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  talent_pipeline: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  technology_complement: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  market_expansion: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

const SUGGESTED_PROMPTS = [
  { label: "I'm a DeFi protocol", url: "" },
  { label: "I'm an investor looking for deals", url: "" },
  { label: "I'm a developer looking for jobs", url: "" },
];

export default function OpportunityPanel({
  slug,
  onHighlightNode,
  onHighlightNodes,
  isMobile = false,
}: OpportunityPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [companyUrl, setCompanyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<SynergyMatch[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companySummary, setCompanySummary] = useState("");
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [specificContext, setSpecificContext] = useState("");

  const handleSubmit = async (url?: string) => {
    const targetUrl = url || companyUrl.trim();
    if (!targetUrl || loading) return;

    setLoading(true);
    setError("");
    setMatches([]);
    setHasSearched(true);
    setIsOpen(true);

    try {
      const res = await fetch(`/api/event/${slug}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUrl: targetUrl,
          goals: selectedGoals.size > 0 ? [...selectedGoals] : undefined,
          specificContext: specificContext.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Failed to find matches");
        return;
      }

      setCompanyName(data.companyName || "");
      setCompanySummary(data.companySummary || "");
      setMatches(data.matches || []);

      // Highlight all matched nodes on the graph
      if (onHighlightNodes && data.matches?.length) {
        onHighlightNodes(data.matches.map((m: SynergyMatch) => m.nodeId));
      }
    } catch {
      setError("Failed to connect to matching service");
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (match: SynergyMatch) => {
    if (onHighlightNode) {
      onHighlightNode(match.nodeId);
    }
  };

  const scoreBarColor = (score: number) => {
    if (score >= 0.8) return "bg-emerald-400";
    if (score >= 0.6) return "bg-cyan-400";
    if (score >= 0.4) return "bg-amber-400";
    return "bg-zinc-400";
  };

  return (
    <>
      {/* Toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`absolute z-50 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-cyan-600/30 transition-all hover:scale-105 ${
            isMobile ? "bottom-4 right-[4.5rem] w-12 h-12" : "bottom-6 right-24 w-14 h-14"
          }`}
          title="Find Opportunities"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className={`absolute z-50 bg-[#0d1424]/95 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 flex flex-col overflow-hidden ${
          isMobile
            ? "bottom-0 right-0 left-0 max-h-[85vh] rounded-t-2xl"
            : "bottom-6 right-24 w-[420px] max-h-[600px] rounded-2xl"
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Find Opportunities</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/80 transition"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Input */}
          <div className="p-4 border-b border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Enter your company URL..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 transition"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={loading || !companyUrl.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  "Match"
                )}
              </button>
            </div>

            {/* Goals section — collapsible */}
            <button
              onClick={() => setShowGoals(!showGoals)}
              className="mt-2 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${showGoals ? "rotate-90" : ""}`}>
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
              What are you looking for? (optional)
            </button>

            {showGoals && (
              <div className="mt-2 space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "partners", label: "Partners", icon: "🤝" },
                    { id: "investors", label: "Investors", icon: "💰" },
                    { id: "clients", label: "Clients", icon: "👥" },
                    { id: "tech_integrations", label: "Tech Integrations", icon: "🔧" },
                    { id: "market_entry", label: "Market Entry", icon: "🌎" },
                  ].map((goal) => (
                    <button
                      key={goal.id}
                      onClick={() => setSelectedGoals((prev) => {
                        const next = new Set(prev);
                        if (next.has(goal.id)) next.delete(goal.id);
                        else next.add(goal.id);
                        return next;
                      })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        selectedGoals.has(goal.id)
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                          : "bg-white/5 border-white/10 text-white/50 hover:text-white/70 hover:border-white/20"
                      }`}
                    >
                      {goal.icon} {goal.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={specificContext}
                  onChange={(e) => setSpecificContext(e.target.value)}
                  placeholder='e.g. "Looking for L2s to deploy our contracts on"'
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-cyan-500/40 transition"
                />
              </div>
            )}

            {/* Suggested prompts */}
            {!hasSearched && !showGoals && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-white/30">Or try a quick search:</p>
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCompanyUrl(prompt.label);
                      handleSubmit(prompt.label);
                    }}
                    className="block w-full text-left text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 px-3 py-2 rounded-lg transition border border-white/5"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[100px] max-h-[400px]">
            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/40 text-sm">Researching your company & matching...</p>
                <p className="text-white/20 text-xs">This may take 15-30 seconds</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Company summary */}
            {companyName && !loading && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-white">{companyName}</h4>
                {companySummary && (
                  <p className="text-xs text-white/50 mt-1">{companySummary}</p>
                )}
                <p className="text-xs text-cyan-400 mt-2">
                  {matches.length} {matches.length === 1 ? "match" : "matches"} found
                </p>
              </div>
            )}

            {/* Match results */}
            {matches.map((match, i) => (
              <button
                key={`${match.nodeId}-${i}`}
                onClick={() => handleMatchClick(match)}
                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg p-3 transition group"
              >
                {/* Name + cluster dot + score */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          BLOCKCHAIN_CLUSTER_COLORS[match.cluster] || "#6b7280",
                      }}
                    />
                    <span className="text-sm font-medium text-white truncate group-hover:text-cyan-300 transition">
                      {match.name}
                    </span>
                  </div>
                  <span className="text-xs text-white/40 flex-shrink-0">
                    {Math.round(match.score * 100)}%
                  </span>
                </div>

                {/* Score bar */}
                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreBarColor(match.score)}`}
                    style={{ width: `${match.score * 100}%` }}
                  />
                </div>

                {/* Synergy badge */}
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      SYNERGY_COLORS[match.synergyType] || SYNERGY_COLORS.potential_partner
                    }`}
                  >
                    {SYNERGY_LABELS[match.synergyType] || match.synergyType}
                  </span>
                  <span className="text-[10px] text-white/30">{match.cluster}</span>
                </div>

                {/* Reasoning */}
                {/* Existing relationship badge */}
                {match.existingRelationship && (
                  <div className="mt-1.5 text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded inline-block">
                    ★ You already work with this company
                  </div>
                )}

                {/* Intel signal */}
                {match.intelSignal && (
                  <div className="mt-1.5 text-[10px] text-cyan-400/60 italic">
                    Signal: {match.intelSignal}
                  </div>
                )}

                <p className="mt-2 text-xs text-white/50 leading-relaxed">
                  {match.reasoning}
                </p>

                {/* Action items */}
                {match.actionItems.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {match.actionItems.map((item, j) => (
                      <li key={j} className="text-xs text-cyan-400/70 flex items-start gap-1.5">
                        <span className="text-cyan-400/40 mt-0.5">&#8250;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ))}

            {/* Empty state after search */}
            {hasSearched && !loading && !error && matches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <p className="text-white/40 text-sm">No strong matches found</p>
                <p className="text-white/20 text-xs">Try a different company URL</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
