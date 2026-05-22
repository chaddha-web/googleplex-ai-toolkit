"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { authedFetch } from "@/lib/auth-client";

const AUTH_BASE =
  process.env.NEXT_PUBLIC_AUTH_BASE || "http://localhost:4200";
const WALLET_BASE =
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201";

type Proposal = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  yes: number;
  no: number;
  likes: number;
  dislikes: number;
  comments: number;
  myVote: "yes" | "no" | null;
  myReaction: "like" | "dislike" | null;
};

export default function CommunityPage() {
  const { user } = useAuth();
  const walletActive = user?.walletStatus === "active";
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [minParty, setMinParty] = useState(0);
  const [partyBal, setPartyBal] = useState<number | null>(null);

  const meetsParty = minParty <= 0 || (partyBal ?? 0) >= minParty;
  const canVote = walletActive && meetsParty;

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals`);
      const data = await res.json().catch(() => ({}));
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
    } catch {
      setProposals([]);
    }
  }, []);

  useEffect(() => {
    load();
    fetch(`${AUTH_BASE}/auth/public-config`)
      .then((r) => r.json())
      .then((d) => setMinParty(Number(d.communityVoteMinParty) || 0))
      .catch(() => {});
    authedFetch(`${WALLET_BASE}/wallet/balances`)
      .then((r) => (r.ok ? r.json() : []))
      .then((assets: Array<{ asset: string; total: number }>) => {
        const party = (Array.isArray(assets) ? assets : []).find((a) => a.asset === "PARTY");
        setPartyBal(party?.total ?? 0);
      })
      .catch(() => setPartyBal(0));
  }, [load]);

  async function vote(id: string, direction: "yes" | "no") {
    if (!canVote || busy) return;
    setBusy(id + ":vote");
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function react(id: string, kind: "like" | "dislike") {
    if (!walletActive || busy) return;
    setBusy(id + ":react");
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind })
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Community</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        The <em className="font-serif-i text-white/60">circle</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
        Discuss and react to proposals. Voting requires an active wallet
        {minParty > 0 ? ` and at least ${minParty.toLocaleString()} PARTY` : ""}.
      </p>

      {!walletActive ? (
        <Banner>
          <span className="text-amber-200 font-medium">Read-only mode.</span> Activate
          your wallet to react, comment, and vote.
        </Banner>
      ) : !meetsParty ? (
        <Banner>
          <span className="text-amber-200 font-medium">Voting locked.</span> You hold{" "}
          {(partyBal ?? 0).toLocaleString()} PARTY — {minParty.toLocaleString()} required to
          vote. You can still comment and react.
        </Banner>
      ) : null}

      <section className="mt-12 space-y-3">
        {proposals === null ? (
          <p className="text-white/40 text-sm">Loading proposals…</p>
        ) : proposals.length === 0 ? (
          <p className="text-white/40 text-sm">No proposals yet.</p>
        ) : (
          proposals.map((p, i) => {
            const tot = p.yes + p.no;
            const pct = tot === 0 ? 50 : Math.round((p.yes / tot) * 100);
            return (
              <div key={p.id} className="liquid-glass rounded-2xl p-5">
                <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">
                  P-{String(i + 1).padStart(3, "0")}
                  {p.status ? ` · ${p.status}` : ""}
                </p>
                <p className="text-white text-base">{p.title}</p>
                {p.description && (
                  <p className="text-white/50 text-sm mt-1 leading-relaxed">{p.description}</p>
                )}

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

                {/* Vote + react row */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canVote || busy === p.id + ":vote"}
                    onClick={() => vote(p.id, "yes")}
                    className={`text-xs px-4 py-2 rounded-full font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      p.myVote === "yes" ? "bg-emerald-400 text-black" : "bg-emerald-400/80 text-black hover:bg-emerald-300"
                    }`}
                  >
                    Yes {p.yes > 0 ? `· ${p.yes}` : ""}
                  </button>
                  <button
                    type="button"
                    disabled={!canVote || busy === p.id + ":vote"}
                    onClick={() => vote(p.id, "no")}
                    className={`text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      p.myVote === "no" ? "bg-white text-black" : "ring-1 ring-white/15 text-white/80 hover:bg-white/5"
                    }`}
                  >
                    No {p.no > 0 ? `· ${p.no}` : ""}
                  </button>

                  <span className="w-px h-5 bg-white/10 mx-1" />

                  <button
                    type="button"
                    disabled={!walletActive || busy === p.id + ":react"}
                    onClick={() => react(p.id, "like")}
                    className={`text-xs px-3 py-2 rounded-full transition-colors disabled:opacity-30 ${
                      p.myReaction === "like" ? "bg-white/20 text-white" : "ring-1 ring-white/10 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    👍 {p.likes}
                  </button>
                  <button
                    type="button"
                    disabled={!walletActive || busy === p.id + ":react"}
                    onClick={() => react(p.id, "dislike")}
                    className={`text-xs px-3 py-2 rounded-full transition-colors disabled:opacity-30 ${
                      p.myReaction === "dislike" ? "bg-white/20 text-white" : "ring-1 ring-white/10 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    👎 {p.dislikes}
                  </button>
                </div>

                <Comments proposalId={p.id} count={p.comments} canPost={!!walletActive} onPosted={load} />
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 liquid-glass rounded-2xl p-4 ring-1 ring-amber-300/20">
      <p className="text-white/80 text-sm">{children}</p>
    </div>
  );
}

type Comment = { id: string; author: string; body: string; created_at: number };

function Comments({
  proposalId,
  count,
  canPost,
  onPosted
}: {
  proposalId: string;
  count: number;
  canPost: boolean;
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadComments() {
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${proposalId}/comments`);
      const data = await res.json().catch(() => ({}));
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      setComments([]);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) loadComments();
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${proposalId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.comment) {
        setComments((c) => [...(c ?? []), data.comment]);
        setBody("");
        onPosted();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button onClick={toggle} className="text-white/50 hover:text-white text-xs">
        💬 {open ? "Hide" : "Comments"} {count > 0 ? `(${count})` : ""}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {comments === null ? (
            <p className="text-white/30 text-xs">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-white/30 text-xs">No comments yet — start the conversation.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="text-white/80 font-medium">{c.author}</span>
                <span className="text-white/30 text-xs ml-2">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
                <p className="text-white/70 mt-0.5 leading-relaxed">{c.body}</p>
              </div>
            ))
          )}
          {canPost && (
            <form onSubmit={post} className="flex items-center gap-2 pt-1">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a comment…"
                maxLength={1000}
                className="flex-1 bg-[#1A1A1A] rounded-full px-4 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={!body.trim() || busy}
                className="text-xs px-4 py-2 rounded-full bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40"
              >
                {busy ? "…" : "Post"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
