"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  highlight?: string[];
}

interface AIChatPanelProps {
  lang: "es" | "en";
  onHighlightNodes?: (names: string[]) => void;
  onNodeSelect?: (name: string) => void;
}

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

export default function AIChatPanel({ lang, onHighlightNodes, onNodeSelect }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const labels = t[lang];

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, lang }),
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
          className="fixed bottom-6 right-6 z-50 bg-green-600 hover:bg-green-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-green-900/50 transition-all hover:scale-105"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[500px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-white">{labels.title}</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white transition">
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
                {labels.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="block w-full text-left text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg transition"
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
                      ? "bg-green-600 text-white"
                      : "bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {msg.content}
                  {msg.highlight && msg.highlight.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.highlight.map((name) => (
                        <button
                          key={name}
                          onClick={() => onNodeSelect?.(name)}
                          className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full hover:bg-green-800/50 transition"
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
                <div className="bg-zinc-800 text-zinc-400 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                  {labels.thinking}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={labels.placeholder}
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 transition"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition"
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
