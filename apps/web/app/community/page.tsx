"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch } from "@/lib/auth-client";

const GOV_BASE =
  process.env.NEXT_PUBLIC_GOV_BASE || "http://localhost:4202";

type Proposal = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  // vote tallies (optional — backend may not return yet)
  yes?: number;
  no?: number;
};

// Local seed shown when the governance service returns nothing / is offline.
const SEED: Proposal[] = [
  { id: "seed-1", title: "Set Q3 hosting subsidy cap", description: "Cap platform hosting subsidies at $12k/mo for Q3.", yes: 62, no: 38 },
  { id: "seed-2", title: "Approve Gitcoin Passport tier 3 as an IdentityProvider", description: "Add high-stakes identity gate for sentiment-weighted votes.", yes: 41, no: 59 },
  { id: "seed-3", title: "Treasury swap 50k USDT → USDC", description: "Diversify runway against single-issuer risk.", yes: 78, no: 22 }
];

export default function CommunityPage() {
  const { user } = useAuth();
  const walletActive = user?.walletStatus === "active";
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [usingSeed, setUsingSeed] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${GOV_BASE}/governance/proposals`, { cache: "no-store" });
      if (!res.ok) throw new Error("non-2xx");
      const data = await res.json();
      const list: Proposal[] = Array.isArray(data) ? data : data.proposals ?? [];
      if (list.length === 0) {
        setProposals(SEED);
        setUsingSeed(true);
      } else {
        setProposals(
          list.map((p: any) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            yes: p.yes ?? p.votes_yes ?? 0,
            no: p.no ?? p.votes_no ?? 0
          }))
        );
        setUsingSeed(false);
      }
    } catch {
      setProposals(SEED);
      setUsingSeed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function vote(id: string, direction: "yes" | "no") {
    if (!walletActive || usingSeed) return;
    setVoting(id);
    try {
      const res = await authedFetch(`${GOV_BASE}/governance/proposals/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: user?.id, direction })
      });
      if (res.ok) {
        // optimistic bump, then reload authoritative tallies
        setProposals((prev) =>
          (prev ?? []).map((p) =>
            p.id === id
              ? { ...p, [direction]: (p[direction] ?? 0) + 1 }
              : p
          )
        );
        load();
      }
    } catch {
      /* ignore */
    } finally {
      setVoting(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Community</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        The <em className="font-serif-i text-white/60">circle</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
        Browse proposals and shape the platform. Casting a vote requires an
        active wallet.
      </p>

      {!walletActive && (
        <div className="mt-10 liquid-glass rounded-2xl p-4 ring-1 ring-amber-300/20">
          <p className="text-white/80 text-sm">
            <span className="text-amber-200 font-medium">Read-only mode.</span>{" "}
            Activate your wallet to cast votes.
          </p>
        </div>
      )}

      <section className="mt-12 space-y-3">
        {proposals === null ? (
          <p className="text-white/40 text-sm">Loading proposals…</p>
        ) : (
          proposals.map((p, i) => {
            const yes = p.yes ?? 0;
            const no = p.no ?? 0;
            const tot = yes + no;
            const pct = tot === 0 ? 50 : Math.round((yes / tot) * 100);
            return (
              <div key={p.id} className="liquid-glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
                      P-{String(i + 1).padStart(3, "0")}
                      {p.status ? ` · ${p.status}` : ""}
                    </p>
                    <p className="text-white text-base">{p.title}</p>
                    {p.description && (
                      <p className="text-white/50 text-sm mt-1 leading-relaxed">
                        {p.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Sentiment bar */}
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <span className="text-white/40 w-10 text-right">{pct}%</span>
                  <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-300 to-teal-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-white/40 font-mono">{tot} votes</span>
                </div>

                {/* Vote buttons */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!walletActive || usingSeed || voting === p.id}
                    onClick={() => vote(p.id, "yes")}
                    className="text-xs px-4 py-2 rounded-full bg-emerald-400 text-black font-medium hover:bg-emerald-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={!walletActive || usingSeed || voting === p.id}
                    onClick={() => vote(p.id, "no")}
                    className="text-xs px-4 py-2 rounded-full ring-1 ring-white/15 text-white/80 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    No
                  </button>
                  {voting === p.id && (
                    <span className="text-white/40 text-xs">Casting…</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {usingSeed && (
        <p className="mt-8 text-white/30 text-xs">
          Showing example proposals — the governance service returned none (or is
          offline). Live proposals appear here once created.
        </p>
      )}
    </div>
  );
}
