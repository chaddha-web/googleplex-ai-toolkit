"use client";

/**
 * Admin → Circle moderation.
 *
 * The admin is the sole author of Circle questions. This surface lists every
 * proposal with full tallies (admins always see the split), lets the admin
 * create / edit / close / delete questions, and moderate member comments
 * (hide, pin, hard-delete). Guarded client-side by role and server-side by
 * requireAdmin on every /community/admin/* route.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { authedFetch, AUTH_BASE } from "@/lib/auth-client";

type Proposal = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  phase: "open" | "closed";
  closesAt: number | null;
  quorum: number;
  totalVotes: number;
  outcome: "passed" | "failed" | "no_quorum" | null;
  yes: number | null;
  no: number | null;
  comments: number;
};

type AdminComment = {
  id: string;
  author: string;
  body: string;
  created_at: number;
  parentId: string | null;
  likes: number;
  hidden: boolean;
  pinned: boolean;
  deleted: boolean;
};

/** epoch-ms → value for <input type="datetime-local"> (local time, no tz suffix). */
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export default function AdminCirclePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/proposals`);
      const data = await res.json().catch(() => ({}));
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  async function createProposal(fields: {
    title: string;
    description: string;
    closesAt: number | null;
    quorum: number;
  }): Promise<boolean> {
    setBusy("create");
    setError(null);
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/admin/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't create the question.");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function patchProposal(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await authedFetch(`${AUTH_BASE}/community/admin/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Update failed.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function deleteProposal(id: string) {
    if (!confirm("Delete this question and all its votes and comments? This cannot be undone."))
      return;
    setBusy(id);
    try {
      await authedFetch(`${AUTH_BASE}/community/admin/proposals/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
          ← Admin
        </Link>
        <h1 className="text-lg font-medium">Circle moderation</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200 text-sm">
            {error}
          </div>
        )}

        <NewQuestion onCreate={createProposal} busy={busy === "create"} />

        <div className="mt-10">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-4">
            Questions ({proposals?.length ?? 0})
          </div>
          {proposals === null ? (
            <p className="text-white/40 text-sm">Loading…</p>
          ) : proposals.length === 0 ? (
            <p className="text-white/40 text-sm">No questions yet — post the first one above.</p>
          ) : (
            <div className="space-y-4">
              {proposals.map((p) => (
                <ProposalRow
                  key={p.id}
                  p={p}
                  busy={busy === p.id}
                  onPatch={patchProposal}
                  onDelete={deleteProposal}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NewQuestion({
  onCreate,
  busy
}: {
  onCreate: (f: {
    title: string;
    description: string;
    closesAt: number | null;
    quorum: number;
  }) => Promise<boolean>;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [closes, setCloses] = useState("");
  const [quorum, setQuorum] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await onCreate({
      title: title.trim(),
      description: description.trim(),
      closesAt: fromLocalInput(closes),
      quorum: Number(quorum) || 0
    });
    if (ok) {
      setTitle("");
      setDescription("");
      setCloses("");
      setQuorum("");
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-xs uppercase tracking-widest text-white/40 mb-4">New question</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Question title (e.g. Should we fund the community grant pool?)"
        maxLength={200}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-white/30"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Context / details (optional)"
        maxLength={2000}
        rows={3}
        className="w-full mt-3 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-white/30 resize-y"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <label className="text-sm">
          <span className="text-white/50 text-xs block mb-1">Closes at (leave blank = stays open)</span>
          <input
            type="datetime-local"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 [color-scheme:dark]"
          />
        </label>
        <label className="text-sm">
          <span className="text-white/50 text-xs block mb-1">Quorum (votes needed, 0 = none)</span>
          <input
            type="number"
            min={0}
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
            placeholder="0"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30"
          />
        </label>
      </div>
      <div className="mt-4">
        <button
          type="submit"
          disabled={!title.trim() || busy}
          className="rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post question"}
        </button>
      </div>
    </form>
  );
}

function ProposalRow({
  p,
  busy,
  onPatch,
  onDelete
}: {
  p: Proposal;
  busy: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [description, setDescription] = useState(p.description ?? "");
  const [closes, setCloses] = useState(toLocalInput(p.closesAt));
  const [quorum, setQuorum] = useState(String(p.quorum || ""));

  const closed = p.phase === "closed";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full ${
                closed ? "bg-white/10 text-white/50" : "bg-emerald-400/15 text-emerald-200"
              }`}
            >
              {closed ? p.outcome ?? "closed" : "open"}
            </span>
            {p.closesAt != null && (
              <span className="text-xs text-white/40">
                closes {new Date(p.closesAt).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-white mt-2">{p.title}</p>
          {p.description && <p className="text-white/50 text-sm mt-1">{p.description}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-white/50 font-mono">
            <span>{p.yes ?? 0} yes</span>
            <span>{p.no ?? 0} no</span>
            <span>
              {p.totalVotes}
              {p.quorum > 0 ? ` / ${p.quorum} quorum` : ""} votes
            </span>
            <span>{p.comments} comments</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
        {!closed && (
          <button
            disabled={busy}
            onClick={() => onPatch(p.id, { status: "closed" })}
            className="text-xs px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5 disabled:opacity-40"
          >
            Close now
          </button>
        )}
        {closed && p.status !== "open" && (
          <button
            disabled={busy}
            onClick={() => onPatch(p.id, { status: "open", closesAt: null })}
            className="text-xs px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5 disabled:opacity-40"
          >
            Re-open
          </button>
        )}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5"
        >
          {showComments ? "Hide comments" : `Moderate comments (${p.comments})`}
        </button>
        <button
          disabled={busy}
          onClick={() => onDelete(p.id)}
          className="text-xs px-3 py-1.5 rounded-full ring-1 ring-rose-400/25 text-rose-200/80 hover:bg-rose-400/10 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {editing && (
        <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-white/30"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-white/30 resize-y"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-white/50 text-xs block mb-1">Closes at</span>
              <input
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 [color-scheme:dark]"
              />
            </label>
            <label className="text-sm">
              <span className="text-white/50 text-xs block mb-1">Quorum</span>
              <input
                type="number"
                min={0}
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>
          </div>
          <button
            disabled={busy || !title.trim()}
            onClick={() => {
              onPatch(p.id, {
                title: title.trim(),
                description: description.trim(),
                closesAt: fromLocalInput(closes),
                quorum: Number(quorum) || 0
              });
              setEditing(false);
            }}
            className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-white/90 disabled:opacity-40"
          >
            Save changes
          </button>
        </div>
      )}

      {showComments && <CommentModeration proposalId={p.id} />}
    </div>
  );
}

function CommentModeration({ proposalId }: { proposalId: string }) {
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authedFetch(`${AUTH_BASE}/community/proposals/${proposalId}/comments`);
    const data = await res.json().catch(() => ({}));
    setComments(Array.isArray(data.comments) ? data.comments : []);
  }, [proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, body: { hidden?: boolean; pinned?: boolean }) {
    setBusy(id);
    try {
      await authedFetch(`${AUTH_BASE}/community/admin/comments/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function hardDelete(id: string) {
    if (!confirm("Permanently delete this comment (and its replies)?")) return;
    setBusy(id);
    try {
      await authedFetch(`${AUTH_BASE}/community/admin/comments/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      {comments === null ? (
        <p className="text-white/40 text-xs">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-white/40 text-xs">No comments.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border px-3 py-2.5 ${
                c.hidden
                  ? "border-white/5 bg-white/[0.01] opacity-60"
                  : "border-white/10 bg-black/30"
              } ${c.parentId ? "ml-6" : ""}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/80 text-sm font-medium">{c.author}</span>
                {c.pinned && (
                  <span className="text-[9px] uppercase tracking-wider text-amber-200 bg-amber-400/15 px-1.5 py-0.5 rounded">
                    Pinned
                  </span>
                )}
                {c.hidden && (
                  <span className="text-[9px] uppercase tracking-wider text-white/50 bg-white/10 px-1.5 py-0.5 rounded">
                    Hidden
                  </span>
                )}
                {c.deleted && (
                  <span className="text-[9px] uppercase tracking-wider text-white/40">
                    deleted by author
                  </span>
                )}
                <span className="text-white/30 text-xs">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className={`text-sm mt-1 ${c.deleted ? "text-white/30 italic" : "text-white/70"}`}>
                {c.body}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  disabled={busy === c.id}
                  onClick={() => moderate(c.id, { hidden: !c.hidden })}
                  className="text-xs px-2.5 py-1 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5 disabled:opacity-40"
                >
                  {c.hidden ? "Unhide" : "Hide"}
                </button>
                <button
                  disabled={busy === c.id}
                  onClick={() => moderate(c.id, { pinned: !c.pinned })}
                  className="text-xs px-2.5 py-1 rounded-full ring-1 ring-white/15 text-white/70 hover:bg-white/5 disabled:opacity-40"
                >
                  {c.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  disabled={busy === c.id}
                  onClick={() => hardDelete(c.id)}
                  className="text-xs px-2.5 py-1 rounded-full ring-1 ring-rose-400/25 text-rose-200/80 hover:bg-rose-400/10 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
