"use client";

/**
 * Admin → Alerts. Each admin links their own Telegram and picks which
 * notifications they want. The founder can subscribe to everything; a
 * sub-admin is limited to signups, login alerts and withdrawals.
 */

import { useCallback, useEffect, useState } from "react";
import { Spinner, BusyLabel, Skeleton, ConfirmDialog } from "@/components/admin/ui";
import {
  adminLinkTelegram,
  adminSetTelegramTopics,
  adminTelegramStatus,
  adminTestTelegram,
  adminUnlinkTelegram,
  type TelegramStatus
} from "@/lib/auth-client";

export function LinkSteps({ botUsername }: { botUsername: string | null }) {
  const handle = botUsername ? `@${botUsername.replace(/^@/, "")}` : "the GoogolPlex bot";
  const link = botUsername ? `https://t.me/${botUsername.replace(/^@/, "")}` : null;
  return (
    <ol className="space-y-3 text-sm">
      <li className="flex gap-3">
        <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/70 text-[11px] grid place-items-center">
          1
        </span>
        <span className="text-white/70">
          Open Telegram and start a chat with{" "}
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="text-white underline">
              {handle}
            </a>
          ) : (
            <span className="text-white">{handle}</span>
          )}
          .
        </span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/70 text-[11px] grid place-items-center">
          2
        </span>
        <span className="text-white/70">
          Send it <code className="text-white bg-white/10 rounded px-1.5 py-0.5">/start</code>. It replies
          with your Telegram ID — a number like <code className="text-white/80">123456789</code>.
        </span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/70 text-[11px] grid place-items-center">
          3
        </span>
        <span className="text-white/70">Paste that number below and save.</span>
      </li>
    </ol>
  );
}

export default function AlertsPage() {
  const [data, setData] = useState<TelegramStatus | null>(null);
  const [chatId, setChatId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminTelegramStatus());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function link() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const s = await adminLinkTelegram(chatId.trim());
      setData(s);
      setChatId("");
      setNote("Linked — check Telegram, you should have a confirmation message.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(topic: string) {
    if (!data) return;
    const next = data.topics.includes(topic)
      ? data.topics.filter((t) => t !== topic)
      : [...data.topics, topic];
    const prev = data;
    setData({ ...data, topics: next }); // optimistic — this is a checkbox, it should feel instant
    try {
      setData(await adminSetTelegramTopics(next));
      setNote(null);
    } catch (e) {
      setData(prev);
      setError((e as Error).message);
    }
  }

  const linked = !!data?.verifiedAt;

  return (
    <section className="max-w-3xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Your account</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Telegram <em className="font-serif-i text-white/60">alerts</em>.
      </h1>
      <p className="text-white/50 text-sm mt-3">
        Notifications go to your own Telegram. This is per-admin — it doesn&apos;t change anyone else&apos;s.
      </p>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}
      {note && <p className="mt-6 text-emerald-300/90 text-sm">{note}</p>}

      {!data && !error && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {data && (
        <>
          <div className="liquid-glass rounded-2xl p-6 mt-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-serif text-2xl tracking-tight">
                  {linked ? "Connected" : "Connect Telegram"}
                </h2>
                {linked && (
                  <p className="text-white/40 text-xs mt-1">
                    Sending to <code className="text-white/70">{data.chatId}</code>
                  </p>
                )}
              </div>
              {linked && (
                <span className="rounded-full bg-emerald-400/[0.12] text-emerald-300 text-[11px] px-2.5 py-1">
                  Verified
                </span>
              )}
            </div>

            {!linked ? (
              <>
                {data.coveredByOps && (
                  <div className="mt-4 rounded-xl bg-emerald-400/[0.07] ring-1 ring-emerald-300/20 p-4">
                    <p className="text-emerald-200 text-sm">
                      You already receive every alert through the ops channel.
                    </p>
                    <p className="text-white/50 text-xs mt-1 leading-relaxed">
                      Linking a personal chat here is optional — do it only if you want to choose
                      which alerts you get rather than all of them.
                    </p>
                  </div>
                )}
                <div className="mt-5">
                  <LinkSteps botUsername={data.botUsername} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <input
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && chatId.trim() && !busy) void link();
                    }}
                    inputMode="numeric"
                    placeholder="123456789"
                    className="flex-1 min-w-[200px] rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30 font-mono"
                  />
                  <button
                    type="button"
                    onClick={link}
                    disabled={busy || !chatId.trim()}
                    className="rounded-full bg-white text-black px-6 py-2.5 text-sm font-medium disabled:opacity-40"
                  >
                    <BusyLabel busy={busy} busyText="Verifying…">
                      Link &amp; verify
                    </BusyLabel>
                  </button>
                </div>
                <p className="text-white/30 text-[11px] mt-2">
                  We send a test message straight away — if it doesn&apos;t arrive, nothing is saved.
                </p>
              </>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setTesting(true);
                    setError(null);
                    try {
                      await adminTestTelegram();
                      setNote("Test sent — check Telegram.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setTesting(false);
                    }
                  }}
                  disabled={testing}
                  className="rounded-full ring-1 ring-white/20 text-white px-5 py-2 text-sm disabled:opacity-40"
                >
                  <BusyLabel busy={testing} busyText="Sending…">
                    Send a test
                  </BusyLabel>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  className="text-rose-300/70 hover:text-rose-200 text-sm underline"
                >
                  Unlink
                </button>
              </div>
            )}
          </div>

          <div className={`liquid-glass rounded-2xl p-6 mt-4 ${linked ? "" : "opacity-50 pointer-events-none"}`}>
            <h2 className="font-serif text-2xl tracking-tight">What you get</h2>
            <p className="text-white/40 text-xs mt-1">
              {data.isFounder
                ? "As the main admin you can receive everything."
                : "Sub-admins receive the operational alerts only. The rest is main-admin only."}
            </p>

            <div className="mt-5 space-y-2">
              {data.allowedTopics.map((t) => {
                const on = data.topics.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(t)}
                    className={`w-full flex items-center gap-3 text-left rounded-xl px-4 py-3 ring-1 transition-colors ${
                      on ? "bg-white/10 ring-white/40" : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      className={`shrink-0 w-4 h-4 rounded ring-1 grid place-items-center ${
                        on ? "bg-white ring-white" : "ring-white/30"
                      }`}
                    >
                      {on && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="text-white text-sm">{data.labels[t] ?? t}</span>
                  </button>
                );
              })}
            </div>

            {!data.isFounder && (
              <p className="text-white/30 text-[11px] mt-4">
                Settings changes, admin promotions and system health go to the main admin only.
              </p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink your Telegram?"
        body="You'll stop receiving alerts until you link it again."
        confirmLabel="Unlink"
        tone="danger"
        onClose={() => setConfirmUnlink(false)}
        onConfirm={async () => {
          setConfirmUnlink(false);
          try {
            setData(await adminUnlinkTelegram());
            setNote("Unlinked.");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    </section>
  );
}
