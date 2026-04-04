"use client";

import { useState, useRef, useEffect } from "react";

/** Render simple markdown: **bold**, *italic*, bullet lists, line breaks */
function renderMarkdown(text: string) {
  // Split into lines for list handling
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-4 my-1.5 space-y-0.5">
          {listItems.map((item, j) => (
            <li key={j}><span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} /></li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushList();
      continue;
    }
    // Bullet list item: * item or - item
    const bulletMatch = line.match(/^[\*\-]\s+(.+)/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      continue;
    }
    // Numbered list: 1. item
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      listItems.push(numMatch[1]);
      continue;
    }
    flushList();
    elements.push(
      <p key={`p-${i}`} className="my-1" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
    );
  }
  flushList();
  return elements;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

interface Message {
  role: "user" | "assistant";
  content: string;
  highlight?: string[];
}

interface AIChatPanelProps {
  lang: "es" | "en";
  onHighlightNodes?: (names: string[]) => void;
  onNodeSelect?: (name: string) => void;
  /** Context determines suggestions — "green-panorama" (default) or event slug */
  context?: string;
  // Optional: passed by EventMapShell but not used (chat has its own data source)
  nodes?: unknown[];
  edges?: unknown[];
  isMobile?: boolean;
}

const EVENT_SUGGESTIONS: Record<string, { en: string[]; es: string[] }> = {
  "blockchainrio-2026": {
    en: [
      "Who are the main sponsors of BlockchainRio?",
      "Which DeFi companies are attending?",
      "What are the connections between exchanges?",
      "Show me Brazilian blockchain companies",
    ],
    es: [
      "Quienes son los principales sponsors de BlockchainRio?",
      "Que empresas DeFi asisten?",
      "Cuales son las conexiones entre exchanges?",
      "Mostrame empresas brasileras de blockchain",
    ],
  },
};

const t = {
  es: {
    title: "Pregunta al Ecosistema",
    placeholder: "Ej: Quienes son los principales fondos verdes?",
    send: "Enviar",
    thinking: "Analizando ecosistema...",
    suggestions: [
      "Quienes son los principales fondos verdes?",
      "Que empresas fondea Antom?",
      "Startups de bonos de carbono",
      "Como se conecta Kilimo con organizaciones internacionales?",
    ],
  },
  en: {
    title: "Ask the Ecosystem",
    placeholder: "E.g.: Who are the main green funds?",
    send: "Send",
    thinking: "Analyzing ecosystem...",
    suggestions: [
      "Who are the main green funds?",
      "What companies does Antom fund?",
      "Carbon credit startups",
      "How is Kilimo connected to international orgs?",
    ],
  },
};

export default function AIChatPanel({ lang, onHighlightNodes, onNodeSelect, context, nodes, edges, isMobile = false }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const labels = t[lang];

  // Use event-specific suggestions if context matches an event
  const eventSuggestions = context ? EVENT_SUGGESTIONS[context]?.[lang] : null;
  const suggestions = eventSuggestions || labels.suggestions;
  const placeholder = context && EVENT_SUGGESTIONS[context]
    ? (lang === "es" ? "Ej: Quienes son los sponsors principales?" : "E.g.: Who are the main sponsors?")
    : labels.placeholder;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput("");
    setIsOpen(true);
    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Send context + slim graph data so the LLM knows which map we're on
      const graphData = nodes && edges && (nodes as unknown[]).length > 0 ? {
        nodes: (nodes as Record<string, unknown>[]).map(n => ({
          nombre: n.nombre, cluster: n.cluster, categoria: n.categoria,
          descripcion: n.descripcion, event_role: n.event_role, event_sponsor_tier: n.event_sponsor_tier,
        })),
        edges: (edges as Record<string, unknown>[]).map(e => ({
          source: e.source_id, target: e.target_id, type: e.relationship_type,
        })),
      } : null;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, lang, context: context || "green-panorama", graphData }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        const assistantMsg: Message = {
          role: "assistant",
          content: data.answer,
          highlight: data.highlight,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Highlight nodes on the graph
        if (data.highlight?.length && onHighlightNodes) {
          onHighlightNodes(data.highlight);
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error connecting to AI" }]);
    } finally {
      setLoading(false);
    }
  };

  // Floating chat button + panel
  return (
    <>
      {/* Toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`z-50 bg-[#1a6b4a] hover:bg-[#155a3e] text-[#1a1a1a] rounded-full flex items-center justify-center shadow-lg shadow-[#1a6b4a]/30 transition-all hover:scale-105 ${
            isMobile ? "fixed bottom-4 right-4 w-12 h-12" : "absolute bottom-6 right-6 w-14 h-14"
          }`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className={`z-50 bg-[#faf8f5]/95 backdrop-blur-md border border-[#ddd8ce] shadow-2xl flex flex-col overflow-hidden ${
          isMobile
            ? "fixed bottom-0 right-0 left-0 max-h-[85vh] rounded-t-2xl"
            : "absolute bottom-6 right-6 w-96 max-h-[500px] rounded-2xl"
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#ddd8ce] bg-zinc-100/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-[#1a1a1a]">{labels.title}</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-600 hover:text-[#1a1a1a] transition">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[340px]">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 mb-3">
                  {lang === "es" ? "Prueba preguntar:" : "Try asking:"}
                </p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="block w-full text-left text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-2 rounded-lg transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === "user"
                      ? "bg-[#1a6b4a] text-white"
                      : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  <div className="leading-relaxed">{msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}</div>
                  {msg.highlight && msg.highlight.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.highlight.map((name) => (
                        <button
                          key={name}
                          onClick={() => onNodeSelect?.(name)}
                          className="text-xs bg-green-100 text-[#1a6b4a] px-2 py-0.5 rounded-full hover:bg-green-200 transition"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-100 text-zinc-600 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                  {labels.thinking}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#ddd8ce]">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={placeholder}
                className="flex-1 bg-zinc-100 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-zinc-500 focus:outline-none focus:border-green-500 transition"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="bg-[#1a6b4a] hover:bg-[#155a3e] disabled:bg-zinc-200 disabled:text-zinc-500 text-[#1a1a1a] px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                {labels.send}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
