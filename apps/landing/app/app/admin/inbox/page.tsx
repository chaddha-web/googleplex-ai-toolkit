"use client";

/**
 * Admin → Inbox.
 *
 * Lists inbound emails received via the Resend inbound webhook. Click a row
 * to view it; "Archive" removes it from the list (soft delete — stays in DB).
 *
 * HTML bodies render in a sandboxed iframe so any styles/scripts in the
 * inbound message can't escape into our app shell.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { email, type InboxRow, type InboxMessage } from "@/lib/auth-client";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function InboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<InboxRow[] | null>(null);
  const [open, setOpen] = useState<InboxMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function load() {
    try {
      setList(await email.listInbox());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user?.role === "admin") load();
    // Poll every 30s so new mail shows up without a manual refresh.
    const t = setInterval(() => {
      if (user?.role === "admin") load();
    }, 30_000);
    return () => clearInterval(t);
  }, [user]);

  async function openMessage(id: string) {
    setBusy(true);
    try {
      const m = await email.getInbox(id);
      setOpen(m);
      // The backend marked it read; reflect locally.
      setList((cur) =>
        (cur ?? []).map((r) => (r.id === id ? { ...r, read_at: r.read_at ?? Date.now() } : r))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    try {
      await email.archiveInbox(id);
      setList((cur) => (cur ?? []).filter((r) => r.id !== id));
      if (open?.id === id) setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
            ← Admin
          </Link>
          <h1 className="text-lg font-medium">Inbox</h1>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15"
        >
          Refresh
        </button>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-[360px_1fr] min-h-[calc(100vh-65px)]">
        <aside className="border-r border-white/10 overflow-y-auto">
          {!list ? (
            <div className="p-4 text-white/40 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-6 text-white/40 text-sm text-center">
              Nothing in the inbox yet.
              <div className="mt-2 text-white/30 text-xs">
                Configure Resend Inbound to POST to <code>/auth/email/inbound</code>.
              </div>
            </div>
          ) : (
            <ul>
              {list.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMessage(m.id)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 ${
                      open?.id === m.id ? "bg-white/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {!m.read_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      )}
                      <div className="text-sm font-medium truncate">
                        {m.from_name || m.from_email}
                      </div>
                      <div className="ml-auto text-[11px] text-white/40 shrink-0">
                        {fmtTime(m.received_at).split(",")[0]}
                      </div>
                    </div>
                    <div className="text-sm text-white/70 truncate mt-0.5">
                      {m.subject || "(no subject)"}
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">{m.from_email}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="overflow-y-auto">
          {error && (
            <div className="m-4 text-sm text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {!open ? (
            <div className="p-12 text-center text-white/40">Select a message to read.</div>
          ) : (
            <article className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-light leading-tight mb-1 truncate">
                    {open.subject || "(no subject)"}
                  </h2>
                  <div className="text-sm text-white/60">
                    <span className="text-white/80">{open.from_name || open.from_email}</span>
                    {open.from_name && (
                      <span className="text-white/40"> &lt;{open.from_email}&gt;</span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    to {open.to_email} · {fmtTime(open.received_at)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`mailto:${open.from_email}?subject=${encodeURIComponent(
                      "Re: " + (open.subject || "")
                    )}`}
                    className="rounded-full bg-white text-black text-sm font-medium px-4 py-2 hover:bg-white/90"
                  >
                    Reply
                  </a>
                  <button
                    type="button"
                    onClick={() => archive(open.id)}
                    className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15"
                  >
                    Archive
                  </button>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
                {open.body_html ? (
                  // Sandboxed iframe — inbound HTML can't access our cookies or DOM.
                  <iframe
                    title="inbound-html"
                    srcDoc={open.body_html}
                    sandbox=""
                    className="w-full min-h-[60vh] bg-white"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap p-4 text-sm text-white/85 font-sans">
                    {open.body_text || "(empty)"}
                  </pre>
                )}
              </div>
            </article>
          )}
          {busy && <div className="p-4 text-white/40 text-sm">Loading…</div>}
        </section>
      </main>
    </div>
  );
}
