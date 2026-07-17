"use client";

/**
 * Admin → Mail. Two tabs, Gmail-style:
 *   • Inbox — inbound emails (Resend inbound webhook → email_inbound).
 *   • Sent  — every email the platform has sent (email_outbound), newest first,
 *             with recipient, subject, status and time.
 *
 * HTML bodies render in a sandboxed iframe so message markup can't touch our
 * app shell.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  email,
  type InboxRow,
  type InboxMessage,
  type SentRow,
  type SentMessage
} from "@/lib/auth-client";

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

// Gmail-ish: time for today, else short date.
function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatusChip({ status }: { status: SentRow["status"] }) {
  const map: Record<string, string> = {
    sent: "bg-emerald-400/15 text-emerald-300",
    failed: "bg-rose-400/15 text-rose-300",
    dev: "bg-amber-400/15 text-amber-300"
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${map[status] ?? "bg-white/10 text-white/50"}`}>
      {status}
    </span>
  );
}

type Tab = "inbox" | "sent";

export default function MailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("inbox");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Inbox state
  const [inList, setInList] = useState<InboxRow[] | null>(null);
  const [inOpen, setInOpen] = useState<InboxMessage | null>(null);

  // Sent state
  const [sentList, setSentList] = useState<SentRow[] | null>(null);
  const [sentOpen, setSentOpen] = useState<SentMessage | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function load() {
    if (user?.role !== "admin") return;
    try {
      if (tab === "inbox") setInList(await email.listInbox());
      else setSentList(await email.listSent());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  // Manual refresh — shows a spinner so it's clear the click did something
  // (the 30s auto-poll uses load() directly, no spinner).
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function openInbox(id: string) {
    setBusy(true);
    try {
      const m = await email.getInbox(id);
      setInOpen(m);
      setInList((cur) =>
        (cur ?? []).map((r) => (r.id === id ? { ...r, read_at: r.read_at ?? Date.now() } : r))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSent(id: string) {
    setBusy(true);
    try {
      setSentOpen(await email.getSent(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    try {
      await email.archiveInbox(id);
      setInList((cur) => (cur ?? []).filter((r) => r.id !== id));
      if (inOpen?.id === id) setInOpen(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const open = tab === "inbox" ? inOpen : sentOpen;

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
            {(["inbox", "sent"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`text-sm font-medium px-4 py-1.5 rounded-full capitalize transition-colors ${
                  tab === t ? "bg-white text-black" : "text-white/60 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15 disabled:opacity-70 inline-flex items-center gap-2"
        >
          <svg
            viewBox="0 0 24 24"
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <main className="grid grid-cols-1 md:grid-cols-[360px_1fr] border border-white/10 rounded-2xl overflow-hidden min-h-[70vh]">
        <aside className="border-r border-white/10 overflow-y-auto">
          {tab === "inbox" ? (
            !inList ? (
              <div className="p-4 text-white/40 text-sm">Loading…</div>
            ) : inList.length === 0 ? (
              <div className="p-6 text-white/40 text-sm text-center">
                Nothing in the inbox yet.
                <div className="mt-2 text-white/30 text-xs">
                  Configure Resend Inbound to POST to <code>/auth/email/inbound</code>.
                </div>
              </div>
            ) : (
              <ul>
                {inList.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openInbox(m.id)}
                      className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 ${
                        inOpen?.id === m.id ? "bg-white/10" : ""
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
                          {fmtWhen(m.received_at)}
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
            )
          ) : !sentList ? (
            <div className="p-4 text-white/40 text-sm">Loading…</div>
          ) : sentList.length === 0 ? (
            <div className="p-6 text-white/40 text-sm text-center">
              No sent emails yet. Every OTP, deposit and notification the platform
              sends will appear here.
            </div>
          ) : (
            <ul>
              {sentList.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openSent(m.id)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 ${
                      sentOpen?.id === m.id ? "bg-white/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">to {m.to_email}</div>
                      <div className="ml-auto text-[11px] text-white/40 shrink-0">
                        {fmtWhen(m.sent_at)}
                      </div>
                    </div>
                    <div className="text-sm text-white/70 truncate mt-0.5">
                      {m.subject || "(no subject)"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusChip status={m.status} />
                      {m.kind && <span className="text-[11px] text-white/35">{m.kind}</span>}
                    </div>
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
          ) : tab === "inbox" && inOpen ? (
            <article className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-light leading-tight mb-1 truncate">
                    {inOpen.subject || "(no subject)"}
                  </h2>
                  <div className="text-sm text-white/60">
                    <span className="text-white/80">{inOpen.from_name || inOpen.from_email}</span>
                    {inOpen.from_name && (
                      <span className="text-white/40"> &lt;{inOpen.from_email}&gt;</span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    to {inOpen.to_email} · {fmtTime(inOpen.received_at)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`mailto:${inOpen.from_email}?subject=${encodeURIComponent(
                      "Re: " + (inOpen.subject || "")
                    )}`}
                    className="rounded-full bg-white text-black text-sm font-medium px-4 py-2 hover:bg-white/90"
                  >
                    Reply
                  </a>
                  <button
                    type="button"
                    onClick={() => archive(inOpen.id)}
                    className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15"
                  >
                    Archive
                  </button>
                </div>
              </div>
              <MailBody html={inOpen.body_html} text={inOpen.body_text} />
            </article>
          ) : (
            sentOpen && (
              <article className="p-6">
                <div className="mb-4">
                  <h2 className="text-2xl font-light leading-tight mb-1 truncate">
                    {sentOpen.subject || "(no subject)"}
                  </h2>
                  <div className="text-sm text-white/60">
                    <span className="text-white/40">from</span> {sentOpen.from_email}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>to {sentOpen.to_email}</span>
                    <span>· {fmtTime(sentOpen.sent_at)}</span>
                    <StatusChip status={sentOpen.status} />
                    {sentOpen.kind && <span className="text-white/35">{sentOpen.kind}</span>}
                    {sentOpen.resend_id && (
                      <span className="text-white/30">· id {sentOpen.resend_id}</span>
                    )}
                  </div>
                  {sentOpen.error && (
                    <div className="mt-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/40 rounded px-2 py-1">
                      {sentOpen.error}
                    </div>
                  )}
                </div>
                <MailBody html={sentOpen.body_html} text={sentOpen.body_text} />
              </article>
            )
          )}
          {busy && <div className="p-4 text-white/40 text-sm">Loading…</div>}
        </section>
      </main>
    </>
  );
}

function MailBody({ html, text }: { html: string | null; text: string | null }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
      {html ? (
        // Sandboxed iframe — message HTML can't access our cookies or DOM.
        <iframe
          title="mail-html"
          srcDoc={html}
          sandbox=""
          className="w-full min-h-[60vh] bg-white"
        />
      ) : (
        <pre className="whitespace-pre-wrap p-4 text-sm text-white/85 font-sans">
          {text || "(empty)"}
        </pre>
      )}
    </div>
  );
}
