"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-context";

/**
 * Studio — AI brand kit + zero-click deploy. Publishing is gated behind an
 * active wallet (the deploy spends from the user balance and writes to the
 * shared user-sites volume per PRD §7.4).
 */
export default function StudioPage() {
  const { user } = useAuth();
  const walletActive = user?.walletStatus === "active";
  const [prompt, setPrompt] = useState("");

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Studio</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Ship a brand in <em className="font-serif-i text-white/60">minutes</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
        Describe your project. Studio generates a logo, palette, typography
        and a deployable landing page. Live URL in under 5 minutes.
      </p>

      {!walletActive && (
        <div className="mt-10 liquid-glass rounded-2xl p-4 ring-1 ring-amber-300/20">
          <p className="text-white/80 text-sm">
            <span className="text-amber-200 font-medium">Read-only mode.</span>{" "}
            You can preview Studio examples below. Generating a real project
            requires an active wallet.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // TODO: POST to ai-orchestrator once wallet is active
        }}
        className="mt-10 space-y-4"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="A community-owned coffee roaster co-op. Warm, earthy, slightly playful. Trades on Tron."
          className="bg-[#1A1A1A] border-none rounded-xl w-full px-4 py-3 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 resize-none"
        />
        <button
          type="submit"
          disabled={!walletActive || !prompt.trim()}
          className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Generate brand kit →
        </button>
      </form>

      <section className="mt-16">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-4">
          Recent showcase
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: "Lumen Studios", sub: "Photo collective · TRC20" },
            { name: "Field & Foundry", sub: "Tools co-op · ERC20" },
            { name: "Riverline DAO", sub: "Watershed restoration · BEP20" }
          ].map((p) => (
            <div key={p.name} className="liquid-glass rounded-2xl p-5">
              <p className="text-white text-base font-medium">{p.name}</p>
              <p className="text-white/40 text-xs mt-1">{p.sub}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
