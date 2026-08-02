"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired step.
 *
 * This used to ask "set up your wallet now, or later?". The $1 activation
 * deposit is mandatory now — there is no "later" — so the choice is gone and
 * the only thing left in wallet setup is the password. Kept as a redirect
 * because old emails and bookmarks still point here.
 */
export default function RetiredWalletChoice() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/setup/password");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white/50 text-sm font-sans">
      <span className="flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
        Taking you to wallet setup…
      </span>
    </main>
  );
}

/** Still imported by lib/auth-client for the legacy skip flag cleanup. */
export const SKIP_KEY = "gplex.skip_wallet_setup_seen";
