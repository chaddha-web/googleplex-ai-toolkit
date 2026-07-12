"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AUTH_BASE } from "@/lib/auth-client";

/**
 * "This wasn't me" landing from a login-alert email. The token comes in the URL
 * but NO action runs on load — an email prefetcher/scanner can open this page
 * safely. The account is only suspended when the member clicks the button.
 * Reads the token via window.location (not useSearchParams) to avoid the
 * App-Router prerender/Suspense pitfall.
 */
export default function SecureAccountPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function secure() {
    if (!token) return;
    setState("working");
    setErr(null);
    try {
      const res = await fetch(`${AUTH_BASE}/auth/secure-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not secure the account.");
      setState("done");
    } catch (e) {
      setErr((e as Error).message);
      setState("idle");
    }
  }

  const noToken = token === "";

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4 selection:bg-white/30">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/email-logo.png" alt="GoogolPlex" className="h-12 w-12 rounded-full ring-1 ring-white/15" />
          <div className="mt-3 text-[11px] font-semibold tracking-[0.34em] uppercase text-white/45">
            GoogolPlex
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white/[0.03] ring-1 ring-white/10 p-8">
          {state === "done" ? (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30 text-emerald-300 text-xl">✓</div>
              <h1 className="mt-5 text-2xl font-medium tracking-tight">Account secured</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Every session has been signed out and your account is now suspended.
                To restore access, contact support and we&apos;ll verify it&apos;s you.
              </p>
              <Link
                href="/contact"
                className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-[#8A68FF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                Contact support
              </Link>
            </div>
          ) : noToken ? (
            <div className="text-center">
              <h1 className="text-2xl font-medium tracking-tight">Invalid link</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                This secure-account link is missing or malformed. Open the most
                recent sign-in alert from your email and use the link there.
              </p>
              <Link href="/" className="mt-6 inline-block text-sm text-white/50 hover:text-white transition-colors">
                ← Back to home
              </Link>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 text-rose-300 text-xl">!</div>
              <h1 className="mt-5 text-2xl font-medium tracking-tight">Secure your account</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                A sign-in to your GoogolPlex account was flagged. If it wasn&apos;t you,
                secure the account now — this <span className="text-white/80">signs out every device</span> and
                <span className="text-white/80"> suspends the account</span> until support restores access.
              </p>

              {err && <p className="mt-4 text-sm text-rose-300/90">{err}</p>}

              <button
                onClick={secure}
                disabled={state === "working"}
                className="mt-6 w-full rounded-xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-400 active:scale-[0.99] transition disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                {state === "working" ? "Securing…" : "Suspend & sign out everywhere"}
              </button>
              <Link href="/" className="mt-4 inline-block text-sm text-white/45 hover:text-white transition-colors">
                This was me — never mind
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
