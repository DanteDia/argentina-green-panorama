"use client";

import { useState, useRef, useEffect } from "react";
import { BLOCKCHAIN_CLUSTER_COLORS } from "@/lib/event-types";

interface ContactInfo {
  email?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  contact_form?: string;
  contact_person?: string;
}

interface BDPerson {
  name: string;
  title?: string;
  platform: "linkedin" | "x";
  profile_url: string;
  snippet?: string;
  confidence?: number;
}

interface OutboundMessages {
  x_dm?: string;
  linkedin_note?: string;
  email_subject?: string;
  email_body?: string;
}

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
  contactInfo?: ContactInfo;
  bdPeople?: BDPerson[];
  outboundMessages?: OutboundMessages;
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function renderSimpleMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, "<br />");
}

// One-click outbound helpers
function buildXComposeUrl(handle: string, text?: string): string {
  const clean = handle.replace(/^@/, "");
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  return `https://twitter.com/messages/compose?recipient_screen_name=${encodeURIComponent(clean)}${params.toString() ? `&${params}` : ""}`;
}

function buildMailto(email: string, subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${email}${params.toString() ? `?${params}` : ""}`;
}

function xHandleFromUrl(url: string): string | null {
  const m = url.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/);
  return m ? m[1] : null;
}

function BDContactRow({
  person,
  messages,
}: {
  person: BDPerson;
  messages?: OutboundMessages;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setCopied("failed");
    }
  };

  const isX = person.platform === "x";
  const handle = isX ? xHandleFromUrl(person.profile_url) : null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{person.name}</p>
          {person.title && (
            <p className="text-[10px] text-white/50 truncate">{person.title}</p>
          )}
        </div>
        {typeof person.confidence === "number" && (
          <span className="text-[9px] text-white/30 flex-shrink-0">
            {Math.round(person.confidence * 100)}%
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <a
          href={person.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
            isX
              ? "bg-white/10 text-white/70 border-white/10 hover:bg-white/15"
              : "bg-blue-500/15 text-blue-400 border-blue-500/20 hover:bg-blue-500/25"
          }`}
        >
          {isX ? "X profile" : "LinkedIn"}
        </a>

        {isX && handle && messages?.x_dm && (
          <a
            href={buildXComposeUrl(handle, messages.x_dm)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] px-2 py-0.5 rounded-full border bg-cyan-500/15 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/25 transition"
          >
            Send DM
          </a>
        )}

        {!isX && messages?.linkedin_note && (
          <button
            onClick={() => {
              copy("linkedin", messages.linkedin_note!);
              window.open(person.profile_url, "_blank", "noopener,noreferrer");
            }}
            className="text-[10px] px-2 py-0.5 rounded-full border bg-cyan-500/15 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/25 transition"
          >
            {copied === "linkedin" ? "Copied, opening..." : "Copy note + open"}
          </button>
        )}

        {messages?.email_subject && messages?.email_body && (
          <a
            href={buildMailto("", messages.email_subject, messages.email_body)}
            className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25 transition"
            title="Opens your mail client with subject + body prefilled"
          >
            Draft email
          </a>
        )}
      </div>
    </div>
  );
}

const FOLLOW_UP_SUGGESTIONS = [
  "Which match should I prioritize and why?",
  "How should I approach the top-scored company?",
  "Any companies here that could be investors?",
  "What's the best networking strategy for this event?",
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

  // Follow-up chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendFollowUp = async (text?: string) => {
    const msg = text || chatInput.trim();
    if (!msg || chatLoading) return;

    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      // Build context from opportunity results including contact info
      const matchSummaries = matches.map((m) => {
        const contactParts: string[] = [];
        if (m.contactInfo?.email) contactParts.push(`email: ${m.contactInfo.email}`);
        if (m.contactInfo?.linkedin) contactParts.push(`LinkedIn: ${m.contactInfo.linkedin}`);
        if (m.contactInfo?.twitter) contactParts.push(`Twitter/X: ${m.contactInfo.twitter}`);
        if (m.contactInfo?.website) contactParts.push(`website: ${m.contactInfo.website}`);
        if (m.contactInfo?.contact_form) contactParts.push(`contact form: ${m.contactInfo.contact_form}`);
        if (m.contactInfo?.contact_person) contactParts.push(`key contact: ${m.contactInfo.contact_person}`);
        const contactStr = contactParts.length > 0 ? `. Contact: ${contactParts.join(", ")}` : "";
        return `- ${m.name} (${m.cluster}): ${m.synergyType}, score ${Math.round(m.score * 100)}%, reasoning: ${m.reasoning}${m.actionItems.length ? ". Actions: " + m.actionItems.join("; ") : ""}${m.intelSignal ? ". Signal: " + m.intelSignal : ""}${contactStr}`;
      }).join("\n");

      const contextMessage = `You are a business development advisor. The user searched for opportunities at an event and got these results:

Company: ${companyName}
Summary: ${companySummary}

Matches found (with contact info where available):
${matchSummaries}

Previous conversation:
${chatMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}

INSTRUCTIONS:
- Answer the user's follow-up question. Be specific, reference the actual companies and data above.
- When the user asks how to contact or reach a company, provide their SPECIFIC contact info (email, LinkedIn, Twitter, website, contact form, key contact person) from the data above.
- If contact info is available, format it clearly: "Email them at **email@company.com**" or "Connect on **LinkedIn**: [link]"
- If no contact info is available for a company, suggest checking their website or approaching them at the event.
- Keep it concise (max 200 words). Use **bold** for company names and contact details.

User's question: ${msg}`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: contextMessage,
          lang: "en",
          context: slug,
        }),
      });
      const data = await res.json();
      const answer = data.answer || data.error || "No response";
      setChatMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to get response" }]);
    } finally {
      setChatLoading(false);
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
          className={`z-50 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-cyan-600/30 transition-all hover:scale-105 ${
            isMobile ? "fixed bottom-4 right-[4.5rem] w-12 h-12" : "absolute bottom-6 right-24 w-14 h-14"
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
        <div className={`z-50 bg-[#0d1424]/95 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 flex flex-col overflow-hidden ${
          isMobile
            ? "fixed bottom-0 right-0 left-0 max-h-[85vh] rounded-t-2xl"
            : "absolute bottom-6 right-24 w-[420px] max-h-[600px] rounded-2xl"
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

                {/* BD humans + one-click outbound */}
                {match.bdPeople && match.bdPeople.length > 0 && (
                  <div
                    className="mt-2.5 pt-2 border-t border-white/5 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-white/30">
                      BD contacts
                    </p>
                    {match.bdPeople.slice(0, 3).map((person, k) => (
                      <BDContactRow
                        key={`${person.profile_url}-${k}`}
                        person={person}
                        messages={match.outboundMessages}
                      />
                    ))}
                  </div>
                )}

                {/* Contact info */}
                {match.contactInfo && Object.keys(match.contactInfo).length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {match.contactInfo.email && (
                      <a href={`mailto:${match.contactInfo.email}`} className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 hover:bg-emerald-500/25 transition">
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z"/><path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z"/></svg>
                        {match.contactInfo.email}
                      </a>
                    )}
                    {match.contactInfo.linkedin && (
                      <a href={match.contactInfo.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 hover:bg-blue-500/25 transition">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        LinkedIn
                      </a>
                    )}
                    {match.contactInfo.twitter && (
                      <a href={match.contactInfo.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10 hover:bg-white/15 transition">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        X
                      </a>
                    )}
                    {match.contactInfo.website && (
                      <a href={match.contactInfo.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10 hover:bg-white/15 transition">
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"/></svg>
                        Website
                      </a>
                    )}
                    {match.contactInfo.contact_form && (
                      <a href={match.contactInfo.contact_form} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full border border-white/10 hover:bg-white/15 transition">
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/></svg>
                        Contact Form
                      </a>
                    )}
                    {match.contactInfo.contact_person && (
                      <span className="text-[10px] text-white/40 px-1">
                        Contact: {match.contactInfo.contact_person}
                      </span>
                    )}
                  </div>
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

            {/* Follow-up chat section — appears after results */}
            {matches.length > 0 && !loading && (
              <div className="mt-2 pt-3 border-t border-white/10">
                {/* Follow-up suggestions (only when no chat yet) */}
                {chatMessages.length === 0 && (
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs text-white/30">Dig deeper:</p>
                    {FOLLOW_UP_SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendFollowUp(s)}
                        className="block w-full text-left text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 px-3 py-2 rounded-lg transition border border-white/5"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat messages */}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex mb-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-cyan-600 text-white"
                          : "bg-white/10 text-white/80"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <span dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(msg.content) }} />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start mb-2">
                    <div className="bg-white/10 text-white/50 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Follow-up chat input — sticky at bottom */}
          {matches.length > 0 && !loading && (
            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendFollowUp()}
                  placeholder="Ask about these matches..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 transition"
                />
                <button
                  onClick={() => sendFollowUp()}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-white px-3 py-2 rounded-lg text-sm font-medium transition"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
