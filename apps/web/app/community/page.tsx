"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  phase: "open" | "closed";
  closesAt: number | null;
  quorum: number;
  totalVotes: number;
  outcome: "passed" | "failed" | "no_quorum" | null;
  yes: number | null; // null until the caller has voted or it closed
  no: number | null;
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
      // Always reload — reveals the tally the moment the vote lands.
      if (res.ok || res.status === 409) await load();
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
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Circle</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        The <em className="font-serif-i text-white/60">Circle</em>.
      </h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
        Questions are set by the Circle stewards. Your vote is final and only counts
        while a question is open — so weigh in before it closes. Voting requires an
        active wallet{minParty > 0 ? ` and at least ${minParty.toLocaleString()} PARTY` : ""}.
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
          <p className="text-white/40 text-sm">No questions yet — check back soon.</p>
        ) : (
          proposals.map((p, i) => (
            <ProposalCard
              key={p.id}
              p={p}
              index={i}
              canVote={canVote}
              walletActive={!!walletActive}
              busy={busy}
              onVote={vote}
              onReact={react}
              onReload={load}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ProposalCard({
  p,
  index,
  canVote,
  walletActive,
  busy,
  onVote,
  onReact,
  onReload
}: {
  p: Proposal;
  index: number;
  canVote: boolean;
  walletActive: boolean;
  busy: string | null;
  onVote: (id: string, d: "yes" | "no") => void;
  onReact: (id: string, k: "like" | "dislike") => void;
  onReload: () => void;
}) {
  const closed = p.phase === "closed";
  const revealed = p.yes !== null && p.no !== null;
  const yes = p.yes ?? 0;
  const no = p.no ?? 0;
  const tot = yes + no;
  const pct = tot === 0 ? 50 : Math.round((yes / tot) * 100);
  const quorumPct =
    p.quorum > 0 ? Math.min(100, Math.round((p.totalVotes / p.quorum) * 100)) : null;

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">
          P-{String(index + 1).padStart(3, "0")}
        </p>
        {closed ? (
          <OutcomeBadge outcome={p.outcome} />
        ) : (
          <Countdown closesAt={p.closesAt} />
        )}
      </div>

      <p className="text-white text-base mt-1">{p.title}</p>
      {p.description && (
        <p className="text-white/50 text-sm mt-1 leading-relaxed">{p.description}</p>
      )}

      {/* Quorum progress — always visible; drives the "your vote matters" pressure. */}
      {p.quorum > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-white/40 mb-1">
            <span>Turnout</span>
            <span className="font-mono">
              {p.totalVotes} / {p.quorum} needed
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                (quorumPct ?? 0) >= 100 ? "bg-emerald-400" : "bg-white/40"
              }`}
              style={{ width: `${quorumPct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Result — hidden until the caller votes or the question closes. */}
      {revealed ? (
        <div className="mt-4 flex items-center gap-3 text-xs">
          <span className="text-emerald-300/80 w-10 text-right">{pct}%</span>
          <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-300 to-teal-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-white/40 font-mono">
            {yes} yes · {no} no
          </span>
        </div>
      ) : (
        <p className="mt-4 text-white/40 text-xs italic">
          Cast your vote to see where the Circle stands.
        </p>
      )}

      {/* Vote + react row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {closed ? (
          <span className="text-xs px-4 py-2 rounded-full ring-1 ring-white/10 text-white/50">
            {p.myVote
              ? `Voting closed — you voted ${p.myVote.toUpperCase()}`
              : "Voting closed"}
          </span>
        ) : p.myVote ? (
          <span className="text-xs px-4 py-2 rounded-full bg-white/10 text-white font-medium">
            You voted {p.myVote.toUpperCase()} ✓ · final
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={!canVote || busy === p.id + ":vote"}
              onClick={() => onVote(p.id, "yes")}
              className="text-xs px-4 py-2 rounded-full font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-400/90 text-black hover:bg-emerald-300"
            >
              Vote Yes
            </button>
            <button
              type="button"
              disabled={!canVote || busy === p.id + ":vote"}
              onClick={() => onVote(p.id, "no")}
              className="text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-white/15 text-white/80 hover:bg-white/5"
            >
              Vote No
            </button>
          </>
        )}

        <span className="w-px h-5 bg-white/10 mx-1" />

        <button
          type="button"
          disabled={!walletActive || busy === p.id + ":react"}
          onClick={() => onReact(p.id, "like")}
          className={`text-xs px-3 py-2 rounded-full transition-colors disabled:opacity-30 ${
            p.myReaction === "like" ? "bg-white/20 text-white" : "ring-1 ring-white/10 text-white/70 hover:bg-white/5"
          }`}
        >
          Like{p.likes > 0 ? ` · ${p.likes}` : ""}
        </button>
        <button
          type="button"
          disabled={!walletActive || busy === p.id + ":react"}
          onClick={() => onReact(p.id, "dislike")}
          className={`text-xs px-3 py-2 rounded-full transition-colors disabled:opacity-30 ${
            p.myReaction === "dislike" ? "bg-white/20 text-white" : "ring-1 ring-white/10 text-white/70 hover:bg-white/5"
          }`}
        >
          Dislike{p.dislikes > 0 ? ` · ${p.dislikes}` : ""}
        </button>
      </div>

      <Comments proposalId={p.id} count={p.comments} canPost={walletActive} onPosted={onReload} />
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: Proposal["outcome"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    passed: { label: "Passed", cls: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/30" },
    failed: { label: "Failed", cls: "bg-rose-400/15 text-rose-200 ring-rose-300/25" },
    no_quorum: { label: "No quorum", cls: "bg-white/10 text-white/60 ring-white/15" }
  };
  const fallback = { label: "Closed", cls: "bg-white/10 text-white/60 ring-white/15" };
  const m = (outcome && map[outcome]) || fallback;
  return (
    <span className={`text-[10px] tracking-[0.15em] uppercase px-2.5 py-1 rounded-full ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

function Countdown({ closesAt }: { closesAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (closesAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [closesAt]);

  if (closesAt == null) {
    return <span className="text-[10px] tracking-[0.15em] uppercase text-white/40">Open</span>;
  }
  const ms = closesAt - now;
  if (ms <= 0) {
    return <span className="text-[10px] tracking-[0.15em] uppercase text-white/40">Closing…</span>;
  }
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const urgent = ms < 60 * 60 * 1000; // under an hour
  const label =
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return (
    <span
      className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-full ${
        urgent ? "bg-rose-400/15 text-rose-200" : "text-white/50"
      }`}
      title="Time left to vote"
    >
      ⏳ {label}
    </span>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 liquid-glass rounded-2xl p-4 ring-1 ring-amber-300/20">
      <p className="text-white/80 text-sm">{children}</p>
    </div>
  );
}

type Comment = {
  id: string;
  author: string;
  body: string;
  created_at: number;
  parentId: string | null;
  likes: number;
  myLiked: boolean;
  mine: boolean;
  deleted: boolean;
  editedAt: number | null;
};

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
  const [err, setErr] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${proposalId}/comments`);
      const data = await res.json().catch(() => ({}));
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      setComments([]);
    }
  }, [proposalId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) loadComments();
  }

  async function submit(text: string, parentId: string | null) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals/${proposalId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim(), parentId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.comment) {
        setComments((c) => [...(c ?? []), data.comment]);
        setBody("");
        setReplyTo(null);
        onPosted();
      } else {
        setErr(data.error || "Couldn't post that.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function editComment(id: string, text: string): Promise<boolean> {
    setErr(null);
    const res = await authedFetch(`${AUTH_BASE}/community/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setComments((cs) =>
        (cs ?? []).map((c) =>
          c.id === id ? { ...c, body: data.body ?? text.trim(), editedAt: data.editedAt ?? Date.now() } : c
        )
      );
      return true;
    }
    setErr(data.error || "Couldn't save the edit.");
    return false;
  }

  async function deleteComment(id: string) {
    setComments((cs) =>
      (cs ?? []).map((c) => (c.id === id ? { ...c, deleted: true, body: "[deleted]" } : c))
    );
    try {
      await authedFetch(`${AUTH_BASE}/community/comments/${id}`, { method: "DELETE" });
      onPosted();
    } catch {
      loadComments();
    }
  }

  async function likeComment(id: string) {
    setComments((cs) =>
      (cs ?? []).map((c) =>
        c.id === id
          ? { ...c, myLiked: !c.myLiked, likes: c.likes + (c.myLiked ? -1 : 1) }
          : c
      )
    );
    try {
      await authedFetch(`${AUTH_BASE}/community/comments/${id}/like`, { method: "POST" });
    } catch {
      loadComments();
    }
  }

  const top = (comments ?? []).filter((c) => !c.parentId);
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parentId === id);

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button onClick={toggle} className="text-white/50 hover:text-white text-xs">
        {open ? "Hide comments" : "Comments"}
        {count > 0 ? ` (${count})` : ""}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {comments === null ? (
            <p className="text-white/30 text-xs">Loading…</p>
          ) : top.length === 0 ? (
            <p className="text-white/30 text-xs">No comments yet — start the conversation.</p>
          ) : (
            top.map((c) => (
              <CommentItem
                key={c.id}
                c={c}
                replies={repliesOf(c.id)}
                canPost={canPost}
                busy={busy}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                onReply={(text) => submit(text, c.id)}
                onLike={likeComment}
                onEdit={editComment}
                onDelete={deleteComment}
              />
            ))
          )}

          {err && <p className="text-rose-300 text-xs">{err}</p>}

          {canPost && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(body, null);
              }}
              className="flex items-center gap-2 pt-1"
            >
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a comment…"
                maxLength={1000}
                className="flex-1 bg-[#1A1A1A] rounded-full px-4 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-[#8A68FF]/60"
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

function CommentBody({ c }: { c: Comment }) {
  return (
    <p className={`mt-0.5 leading-relaxed ${c.deleted ? "text-white/30 italic" : "text-white/70"}`}>
      {c.body}
      {c.editedAt && !c.deleted ? <span className="text-white/25 text-xs ml-1">(edited)</span> : null}
    </p>
  );
}

function CommentControls({
  c,
  onLike,
  onEdit,
  onDelete,
  onReply,
  canReply
}: {
  c: Comment;
  onLike: (id: string) => void;
  onEdit?: () => void;
  onDelete?: (id: string) => void;
  onReply?: () => void;
  canReply?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mt-1">
      <button
        onClick={() => onLike(c.id)}
        className={`text-xs ${c.myLiked ? "text-white" : "text-white/40 hover:text-white"}`}
      >
        Like{c.likes > 0 ? ` · ${c.likes}` : ""}
      </button>
      {canReply && onReply && (
        <button onClick={onReply} className="text-xs text-white/40 hover:text-white">
          Reply
        </button>
      )}
      {c.mine && !c.deleted && onEdit && (
        <button onClick={onEdit} className="text-xs text-white/40 hover:text-white">
          Edit
        </button>
      )}
      {c.mine && !c.deleted && onDelete && (
        <button
          onClick={() => {
            if (confirm("Delete this comment?")) onDelete(c.id);
          }}
          className="text-xs text-white/40 hover:text-rose-300"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function CommentItem({
  c,
  replies,
  canPost,
  busy,
  replyTo,
  setReplyTo,
  onReply,
  onLike,
  onEdit,
  onDelete
}: {
  c: Comment;
  replies: Comment[];
  canPost: boolean;
  busy: boolean;
  replyTo: string | null;
  setReplyTo: (id: string | null) => void;
  onReply: (text: string) => void;
  onLike: (id: string) => void;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [replyText, setReplyText] = useState("");
  const open = replyTo === c.id;

  return (
    <div className="text-sm">
      <div>
        <span className="text-white/80 font-medium">{c.author}</span>
        <span className="text-white/30 text-xs ml-2">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
        <EditableBody c={c} onEdit={onEdit} />
        <CommentControls
          c={c}
          onLike={onLike}
          onDelete={onDelete}
          onReply={() => setReplyTo(open ? null : c.id)}
          canReply={canPost}
        />
      </div>

      {open && canPost && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onReply(replyText);
            setReplyText("");
          }}
          className="flex items-center gap-2 mt-2 ml-4"
        >
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Reply to ${c.author}…`}
            maxLength={1000}
            className="flex-1 bg-[#1A1A1A] rounded-full px-4 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-[#8A68FF]/60"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || busy}
            className="text-xs px-3 py-2 rounded-full bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40"
          >
            {busy ? "…" : "Reply"}
          </button>
        </form>
      )}

      {replies.length > 0 && (
        <div className="mt-3 ml-4 pl-3 border-l border-white/10 space-y-3">
          {replies.map((r) => (
            <div key={r.id}>
              <span className="text-white/80 font-medium">{r.author}</span>
              <span className="text-white/30 text-xs ml-2">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
              <EditableBody c={r} onEdit={onEdit} />
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={() => onLike(r.id)}
                  className={`text-xs ${r.myLiked ? "text-white" : "text-white/40 hover:text-white"}`}
                >
                  Like{r.likes > 0 ? ` · ${r.likes}` : ""}
                </button>
                {r.mine && !r.deleted && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this comment?")) onDelete(r.id);
                    }}
                    className="text-xs text-white/40 hover:text-rose-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a comment body with inline edit for the author. Keeps the Edit
 * control next to the body so the textarea can replace it in place.
 */
function EditableBody({
  c,
  onEdit
}: {
  c: Comment;
  onEdit: (id: string, text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CommentBody c={c} />
        </div>
        {c.mine && !c.deleted && (
          <button
            onClick={() => {
              setText(c.body);
              setEditing(true);
            }}
            className="text-xs text-white/40 hover:text-white mt-0.5 shrink-0"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || saving) return;
        setSaving(true);
        const ok = await onEdit(c.id, text);
        setSaving(false);
        if (ok) setEditing(false);
      }}
      className="flex items-center gap-2 mt-1"
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        className="flex-1 bg-[#1A1A1A] rounded-full px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#8A68FF]/60"
      />
      <button
        type="submit"
        disabled={!text.trim() || saving}
        className="text-xs px-3 py-2 rounded-full bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-white/40 hover:text-white"
      >
        Cancel
      </button>
    </form>
  );
}
