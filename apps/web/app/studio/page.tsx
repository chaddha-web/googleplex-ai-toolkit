"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import {
  studioQuote,
  unlockStudio,
  buildStudioBusiness,
  type StudioQuoteOption
} from "@/lib/auth-client";

/**
 * Studio — AI brand kit + zero-click deploy. Access is gated behind a one-time
 * $18 fee (StudioPaywall). Once unlocked, publishing still requires an active
 * wallet (the deploy spends from the user balance).
 */
export default function StudioPage() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");

  if (!user) return null;

  // Locked → show the $18 unlock paywall.
  if (!user.studioUnlocked) {
    return <StudioPaywall />;
  }

  const walletActive = user.walletStatus === "active";
  const tokensMinted = user.tokensMinted ?? 0;

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

      {tokensMinted > 0 && (
        <div className="mt-8 liquid-glass rounded-2xl p-5">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
            Your personalized tokens
          </p>
          <p className="text-3xl font-medium tracking-tight">
            {tokensMinted.toLocaleString()}
          </p>
          <p className="text-white/40 text-xs mt-1">
            Minted when you built your business in the Studio.
          </p>
        </div>
      )}

      <BuildForm walletActive={walletActive} alreadyBuilt={tokensMinted > 0} />
    </div>
  );
}

function BuildForm({
  walletActive,
  alreadyBuilt
}: {
  walletActive: boolean;
  alreadyBuilt: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<number | null>(null);
  const [brandKit, setBrandKit] = useState<string | null>(null);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!walletActive || !prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1) Generate the brand kit with the admin-configured AI provider/keys.
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setBrandKit(data.brandKit);
      // 2) Business built → mint the member's 10B tokens (once).
      const { tokensMinted } = await buildStudioBusiness();
      setMinted(tokensMinted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={build} className="mt-10 space-y-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        placeholder="A community-owned coffee roaster co-op. Warm, earthy, slightly playful. Trades on Tron."
        className="bg-[#1A1A1A] border-none rounded-xl w-full px-4 py-3 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 resize-none"
      />
      {error && <p className="text-rose-300/90 text-sm">{error}</p>}
      {minted !== null && (
        <p className="text-emerald-300/90 text-sm">
          🎉 Business built — {minted.toLocaleString()} personalized tokens minted in your name.
        </p>
      )}
      <button
        type="submit"
        disabled={!walletActive || !prompt.trim() || busy}
        className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy
          ? "Generating…"
          : alreadyBuilt
          ? "Generate brand kit →"
          : "Build my business →"}
      </button>

      {brandKit && (
        <div className="liquid-glass rounded-2xl p-6 mt-4">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-3">
            Your AI brand kit
          </p>
          <div className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {brandKit}
          </div>
        </div>
      )}
    </form>
  );
}

function StudioPaywall() {
  const [options, setOptions] = useState<StudioQuoteOption[] | null>(null);
  const [feeUsd, setFeeUsd] = useState(18);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    studioQuote()
      .then((q) => {
        if (!live) return;
        setFeeUsd(q.feeUsd);
        setOptions(q.options);
        if (q.options[0]) setSelected(q.options[0].asset);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, []);

  async function pay() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await unlockStudio(selected);
      // On success the auth context emits the updated user (studioUnlocked),
      // which re-renders the parent into the real Studio.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Studio</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Unlock the <em className="font-serif-i text-white/60">AI Studio</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6">
        A one-time{" "}
        <span className="text-white font-medium">${feeUsd}</span> activation
        unlocks AI brand generation and zero-click deploys. Pay in any coin you
        hold — we convert at the live rate.
      </p>

      <div className="mt-10 liquid-glass rounded-3xl p-6 md:p-8">
        <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-4">
          Choose a coin
        </p>

        {options === null && !error ? (
          <p className="text-white/40 text-sm">Loading live prices…</p>
        ) : options && options.length === 0 ? (
          <p className="text-white/60 text-sm">
            No priced coins available right now. Please try again shortly.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {options?.map((o) => {
              const active = o.asset === selected;
              return (
                <button
                  key={o.asset}
                  type="button"
                  onClick={() => setSelected(o.asset)}
                  className={`rounded-2xl p-4 text-left transition-colors ${
                    active
                      ? "bg-white text-black"
                      : "liquid-glass text-white hover:bg-white/5"
                  }`}
                >
                  <p className="font-medium">{o.asset}</p>
                  <p
                    className={`text-xs mt-1 ${
                      active ? "text-black/60" : "text-white/50"
                    }`}
                  >
                    {o.amount.toLocaleString(undefined, {
                      maximumSignificantDigits: 6
                    })}{" "}
                    {o.asset}
                  </p>
                  <p
                    className={`text-[10px] mt-0.5 ${
                      active ? "text-black/40" : "text-white/30"
                    }`}
                  >
                    @ ${o.price.toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mt-4 text-rose-300/90 text-sm">{error}</p>}

        <button
          type="button"
          onClick={pay}
          disabled={loading || !selected}
          className="mt-6 w-full sm:w-auto rounded-full px-8 py-3 text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "#d6ee4f" }}
        >
          {loading ? "Processing…" : `Pay $${feeUsd} & unlock Studio`}
        </button>

        <p className="text-white/30 text-xs mt-4 leading-relaxed">
          The fee is deducted from your wallet balance in the selected coin.
          You'll need that balance available; deposits go to your wallet
          addresses.
        </p>
      </div>
    </div>
  );
}
