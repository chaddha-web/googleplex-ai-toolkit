"use client";

import { useAuth } from "@/components/auth-context";

export default function CommunityPage() {
  const { user } = useAuth();
  const walletActive = user?.walletStatus === "active";

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Community</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        The <em className="font-serif-i text-white/60">circle</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
        Browse proposals, read comments, upvote and downvote. Joining a DAO and
        casting a token-weighted vote requires an active wallet.
      </p>

      {!walletActive && (
        <div className="mt-10 liquid-glass rounded-2xl p-4 ring-1 ring-amber-300/20">
          <p className="text-white/80 text-sm">
            <span className="text-amber-200 font-medium">Read-only mode.</span>{" "}
            Comments and reactions are available; joining or token-voting is
            locked until your wallet is active.
          </p>
        </div>
      )}

      <section className="mt-12 space-y-3">
        {[
          {
            id: "P-001",
            title: "Set Q3 hosting subsidy cap",
            sentiment: 0.62,
            tokens: "121k GGX"
          },
          {
            id: "P-002",
            title: "Approve new IdentityProvider — Gitcoin Passport tier 3",
            sentiment: 0.41,
            tokens: "88k GGX"
          },
          {
            id: "P-003",
            title: "Treasury swap 50k USDT → USDC for runway diversification",
            sentiment: 0.78,
            tokens: "204k GGX"
          }
        ].map((p) => (
          <div
            key={p.id}
            className="liquid-glass rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
                {p.id}
              </p>
              <p className="text-white text-base">{p.title}</p>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="text-white/60">Sentiment</span>
              <div className="h-1.5 w-20 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{ width: `${Math.round(p.sentiment * 100)}%` }}
                />
              </div>
              <span className="text-white/60 font-mono">{p.tokens}</span>
            </div>
          </div>
        ))}
      </section>

      <p className="mt-12 text-white/30 text-xs">
        Live proposals will replace this preview once governance-service is
        wired.
      </p>
    </div>
  );
}
