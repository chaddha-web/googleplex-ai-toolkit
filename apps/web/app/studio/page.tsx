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


      <BuildForm walletActive={walletActive} alreadyBuilt={tokensMinted > 0} />
    </div>
  );
}

type StudioResult = {
  demo: boolean;
  provider: string;
  storeName: string;
  tagline?: string;
  slug: string;
  url: string;
  brandKit: string;
  founder?: { name: string; role: string; vision: string };
  guidelines?: {
    palette: { hex: string; name: string }[];
    typography: { display: string; body: string };
    voice: string;
  };
};

/** Small numbered section header used across the brand-kit reveal. */
function StepHead({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="w-7 h-7 rounded-full bg-white text-black text-[13px] font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-white/40 text-[11px] tracking-[0.28em] uppercase font-semibold">
        {label}
      </span>
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
  const [storeName, setStoreName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<number | null>(null);
  const [result, setResult] = useState<StudioResult | null>(null);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!walletActive || !prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // 1) Generate the brand kit + a full website, and publish it live.
      setStage("Designing your brand & building your site…");
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, storeName })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setResult(data as StudioResult);
      // 2) Business built → mint the member's 10B tokens (once).
      setStage("Minting your personalized tokens…");
      const { tokensMinted } = await buildStudioBusiness();
      setMinted(tokensMinted);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  const liveUrl = result?.url ?? "";

  return (
    <form onSubmit={build} className="mt-10 space-y-4">
      <div className="grid sm:grid-cols-[minmax(0,220px)_1fr] gap-3">
        <input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="Store name (e.g. Lustre)"
          className="bg-[#1A1A1A] border-none rounded-xl w-full px-4 py-3 text-white placeholder:text-white/20 focus:ring-2 focus:ring-[#8A68FF]/60"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="A premium home & office cleaning concierge, founded by Fateh. Calm, trustworthy, a little luxurious."
          className="bg-[#1A1A1A] border-none rounded-xl w-full px-4 py-3 text-white placeholder:text-white/20 focus:ring-2 focus:ring-[#8A68FF]/60 resize-none"
        />
      </div>
      {error && <p className="text-rose-300/90 text-sm">{error}</p>}
      {busy && stage && <p className="text-white/50 text-sm">{stage}</p>}
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
          ? "Generate brand & site →"
          : "Build my business →"}
      </button>

      {result && (
        <div className="mt-8 space-y-4">
          {/* Load the brand fonts so the type + logo render true-to-brand. */}
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,400..500&family=Hanken+Grotesk:wght@400;500;600&display=swap"
          />

          <div>
            <p className="text-emerald-300/90 text-sm">
              ✓ Brand generated &amp; site published live for{" "}
              <span className="font-medium">{result.storeName}</span>.
            </p>
          </div>

          {/* 1 — THE LOGO */}
          <section className="liquid-glass rounded-2xl p-6">
            <StepHead n={1} label="The logo" />
            <div className="grid sm:grid-cols-[180px_1fr] gap-6 items-center">
              {/* Monogram stage — the real logo mark lives on the generated
                  site itself; we never inject AI-produced SVG into this page. */}
              <div className="aspect-square rounded-2xl bg-white ring-1 ring-white/10 flex items-center justify-center p-8">
                <span
                  className="text-7xl leading-none text-[#18211E]"
                  style={{ fontFamily: "Fraunces, Georgia, serif" }}
                >
                  {result.storeName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p
                  className="text-3xl text-white"
                  style={{ fontFamily: "Fraunces, Georgia, serif" }}
                >
                  {result.storeName}
                </p>
                {result.tagline && (
                  <p className="text-white/50 text-sm italic mt-1">{result.tagline}</p>
                )}
                <p className="text-white/70 text-sm leading-relaxed mt-3">
                  A custom mark generated from your business description — see it
                  in place on your live site below.
                </p>
              </div>
            </div>
          </section>

          {/* 2 — FOUNDER & VISION */}
          {result.founder && (
            <section className="liquid-glass rounded-2xl p-6">
              <StepHead n={2} label="The founder & vision" />
              <div className="grid sm:grid-cols-[88px_1fr] gap-5 items-start">
                <div
                  className="w-22 h-22 sm:w-[88px] sm:h-[88px] rounded-2xl flex items-center justify-center text-4xl"
                  style={{
                    background: "linear-gradient(160deg,#2b574a,#16332b)",
                    color: "#E9C46A",
                    fontFamily: "Fraunces, serif"
                  }}
                >
                  {result.founder.name.charAt(0)}
                </div>
                <div>
                  <p
                    className="text-white text-xl italic leading-snug"
                    style={{ fontFamily: "Fraunces, Georgia, serif" }}
                  >
                    “{result.founder.vision}”
                  </p>
                  <p className="text-white font-medium mt-3">{result.founder.name}</p>
                  <p className="text-white/50 text-sm">{result.founder.role}</p>
                </div>
              </div>
            </section>
          )}

          {/* 3 — BRAND GUIDELINES */}
          {result.guidelines ? (
            <section className="liquid-glass rounded-2xl p-6">
              <StepHead n={3} label="Brand guidelines" />
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-3">
                    Palette
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {result.guidelines.palette.map((c) => (
                      <div key={c.hex} className="w-[78px]">
                        <div
                          className="h-14 rounded-xl ring-1 ring-black/10"
                          style={{ background: c.hex }}
                        />
                        <p className="text-white text-xs font-medium mt-1.5">{c.name}</p>
                        <p className="text-white/40 text-[11px] tabular-nums">{c.hex}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-3">
                    Typography
                  </p>
                  <p
                    className="text-white text-3xl leading-none"
                    style={{ fontFamily: `${result.guidelines.typography.display}, Georgia, serif` }}
                  >
                    {result.guidelines.typography.display}
                  </p>
                  <p className="text-white/40 text-xs mt-1">Display · headings</p>
                  <p
                    className="text-white text-base mt-4"
                    style={{ fontFamily: `${result.guidelines.typography.body}, system-ui, sans-serif` }}
                  >
                    {result.guidelines.typography.body} — clean, friendly body text.
                  </p>
                  <p className="text-white/40 text-xs mt-1">Body · UI</p>
                </div>
                <div className="sm:col-span-2 border-t border-white/5 pt-4">
                  <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-2">
                    Voice &amp; tone
                  </p>
                  <p className="text-white/70 text-sm leading-relaxed">
                    {result.guidelines.voice}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="liquid-glass rounded-2xl p-6">
              <StepHead n={3} label="Brand guidelines" />
              <div className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {result.brandKit}
              </div>
            </section>
          )}

          {/* 4 — FIRST LOOK (live site, 16:9) */}
          <section className="liquid-glass rounded-2xl p-6">
            <StepHead n={4} label="First look" />
            <div className="rounded-xl overflow-hidden ring-1 ring-black/10 bg-white">
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-black/[0.04] border-b border-black/5">
                <span className="flex gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#FF5F57" }} />
                  <i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#FEBC2E" }} />
                  <i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#28C840" }} />
                </span>
                <div className="flex-1 bg-white rounded-md ring-1 ring-black/10 px-3 py-1.5 text-[12px] text-black/55 truncate">
                  🔒 {typeof window !== "undefined" ? window.location.host : ""}
                  {liveUrl}
                </div>
              </div>
              <div className="relative w-full aspect-[16/9] bg-white">
                <iframe
                  title="Live store first look"
                  src={liveUrl}
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
              <p className="text-white/50 text-sm break-all">
                Live at{" "}
                <span className="text-white font-medium">
                  {typeof window !== "undefined" ? window.location.host : ""}
                  {liveUrl}
                </span>
              </p>
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-black rounded-full px-6 py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Open store ↗
              </a>
            </div>
          </section>
        </div>
      )}
    </form>
  );
}

function StudioPaywall() {
  const [options, setOptions] = useState<StudioQuoteOption[] | null>(null);
  const [feeUsd, setFeeUsd] = useState(18);
  const [selected, setSelected] = useState<string | null>(null);
  const [walletPwd, setWalletPwd] = useState("");
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
    if (!selected || !walletPwd.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await unlockStudio(selected, walletPwd);
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

        {/* In-platform spending is authorized with the wallet password. */}
        <div className="mt-6">
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-2">
            Wallet password
          </p>
          <input
            type="password"
            value={walletPwd}
            onChange={(e) => setWalletPwd(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="bg-[#1A1A1A] rounded-xl w-full sm:max-w-xs h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-[#8A68FF]/60"
          />
        </div>

        {error && <p className="mt-4 text-rose-300/90 text-sm">{error}</p>}

        <button
          type="button"
          onClick={pay}
          disabled={loading || !selected || !walletPwd.trim()}
          className="mt-6 w-full sm:w-auto rounded-full px-8 py-3 text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "#d6ee4f" }}
        >
          {loading ? "Processing…" : `Pay $${feeUsd} & unlock Studio`}
        </button>

        <p className="text-white/30 text-xs mt-4 leading-relaxed">
          The fee is deducted from your wallet balance in the selected coin, and
          authorized with your wallet password. Deposits go to your wallet
          addresses.
        </p>
      </div>
    </div>
  );
}
