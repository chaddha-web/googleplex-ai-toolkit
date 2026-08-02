"use client";

/**
 * First-thing-after-login nudge for admins who haven't linked Telegram.
 *
 * Dismissible, but only for the current tab session — it comes back on the next
 * login, which is the point. It disappears permanently once linked, because the
 * status is read from the server rather than from a local flag.
 *
 * Renders nothing until the check resolves, and nothing at all if the request
 * fails: a broken alerts endpoint must not throw a modal in front of an admin
 * trying to do something else.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminTelegramStatus, type TelegramStatus } from "@/lib/auth-client";

const DISMISS_KEY = "gplex.telegram_prompt_dismissed";

export function TelegramPrompt() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we've checked

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    }
    let cancelled = false;
    void adminTelegramStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        /* not an admin, or the service is down — say nothing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to nag about if they're already covered: either they've linked a
  // personal chat, or they ARE the ops channel and receive everything already.
  if (!status || status.verifiedAt || status.coveredByOps || dismissed) return null;

  const handle = status.botUsername ? status.botUsername.replace(/^@/, "") : null;

  return (
    <div className="mb-5 rounded-2xl ring-1 ring-amber-300/25 bg-amber-400/[0.06] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-amber-200 text-sm font-medium">You&apos;re not receiving Telegram alerts</p>
          <p className="text-white/60 text-xs mt-1 leading-relaxed">
            Link your Telegram to get notified about
            {status.isFounder
              ? " signups, logins, withdrawals and everything else as it happens."
              : " new signups, login alerts and withdrawals as they happen."}
          </p>

          <ol className="mt-4 space-y-1.5 text-xs text-white/60">
            <li>
              <span className="text-white/35 mr-1.5">1.</span>
              Open{" "}
              {handle ? (
                <a
                  href={`https://t.me/${handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-200 underline"
                >
                  @{handle}
                </a>
              ) : (
                "the GoogolPlex bot"
              )}{" "}
              in Telegram.
            </li>
            <li>
              <span className="text-white/35 mr-1.5">2.</span>
              Send <code className="text-white bg-white/10 rounded px-1 py-0.5">/start</code> — it replies
              with your Telegram ID.
            </li>
            <li>
              <span className="text-white/35 mr-1.5">3.</span>
              Paste that number into Alerts and save.
            </li>
          </ol>

          <Link
            href="/alerts"
            className="inline-block mt-4 rounded-full bg-white text-black px-5 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Set this up →
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="shrink-0 text-white/30 hover:text-white/70 text-lg leading-none px-1 transition-colors"
          title="Dismiss until next login"
        >
          ×
        </button>
      </div>
    </div>
  );
}
