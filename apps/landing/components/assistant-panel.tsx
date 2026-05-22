"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight } from "@/components/icons";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi — I'm the GoogolPlex Specialist. Ask me anything about the ecosystem, the wallet, the AI Studio, or where to start.";

export function AssistantPanel({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the input when opened.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]);

  // Autoscroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages, page: pathname })
      });
      const data = await res.json().catch(() => ({}));
      const reply =
        data.reply || data.error || "Sorry — something went wrong. Try again.";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Network error — please try again." }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed right-0 top-0 z-[61] h-full w-full sm:w-[420px] bg-[#0b0b0f]/95 backdrop-blur-xl border-l border-white/10 flex flex-col text-white"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center h-8 w-8 rounded-full bg-white/10">
                  <Sparkles size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium leading-tight">
                    GoogolPlex Specialist
                  </p>
                  <p className="text-[10px] text-white/40 tracking-wide">
                    AI guide · context-aware
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close assistant"
                className="text-white/50 hover:text-white text-lg leading-none px-2"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <Bubble role="assistant" content={GREETING} />
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}
              {busy && (
                <Bubble role="assistant" content="…" />
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={send}
              className="border-t border-white/10 p-3 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about GoogolPlex…"
                className="flex-1 bg-white/5 rounded-full px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="shrink-0 grid place-items-center h-11 w-11 rounded-full bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-40"
              >
                <ArrowRight size={18} />
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "bg-white text-black" : "bg-white/10 text-white/90"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
