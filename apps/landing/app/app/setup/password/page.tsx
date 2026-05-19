"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { setWalletPassword } from "@/lib/auth-client";

/**
 * Wallet password setup (argon2id-hashed server-side). After save the
 * walletStatus on the user becomes 'pending_initial_deposit' and we push
 * the user to the deposit page.
 */
export default function PasswordSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checks = useMemo(() => evaluate(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = checks.length && checks.letter && checks.number && matches && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await setWalletPassword(password);
      router.push("/app/setup/deposit");
    } catch (err) {
      setError((err as Error).message || "Could not save your wallet password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans bg-black text-white selection:bg-white/20 selection:text-white">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(180,140,255,0.06)_0%,_transparent_60%)]" />

      <section className="relative z-10 w-full max-w-xl px-6 pt-16 md:pt-24 pb-24">
        <Link
          href="/app/setup/wallet"
          className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-10"
        >
          ← Back
        </Link>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
        >
          Wallet · 1 of 2
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.05 }}
          className="font-serif text-white tracking-tight text-5xl md:text-6xl leading-[1.05]"
        >
          Pick a wallet <em className="font-serif-i text-white/60">password</em>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-white/70 text-base md:text-lg leading-relaxed mt-6"
        >
          Used to sign sensitive actions — withdrawals, large transfers, key
          recovery. We never see the plaintext and never store it; only an
          argon2id hash. If you forget it, you&apos;ll need your recovery
          method to reset.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          onSubmit={handleSubmit}
          className="mt-12 space-y-6"
        >
          <Field
            id="password"
            label="Wallet password"
            type={show ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="At least 12 characters"
            autoComplete="new-password"
          />

          <Field
            id="confirm"
            label="Confirm password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter the same password"
            autoComplete="new-password"
          />

          <label className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-[#1A1A1A] text-white"
            />
            Show password
          </label>

          <div className="liquid-glass rounded-2xl p-4 space-y-1.5">
            <Rule ok={checks.length}>At least 12 characters</Rule>
            <Rule ok={checks.letter}>Contains a letter</Rule>
            <Rule ok={checks.number}>Contains a number</Rule>
            <Rule ok={matches}>Passwords match</Rule>
          </div>

          {error ? (
            <p className="text-sm text-rose-300/90">{error}</p>
          ) : null}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Saving…" : "Save & continue →"}
            </button>
            <Link
              href="/app"
              className="text-white/40 hover:text-white text-xs transition-colors"
            >
              Cancel
            </Link>
          </div>
        </motion.form>

        <p className="mt-10 text-white/30 text-xs">
          Signed in as <span className="text-white/60">{user?.email}</span>
        </p>
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-white block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="bg-[#1A1A1A] border-none rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 transition-shadow"
      />
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          ok ? "bg-emerald-400" : "bg-white/20"
        }`}
      />
      <span className={ok ? "text-white/80" : "text-white/40"}>{children}</span>
    </div>
  );
}

function evaluate(pw: string) {
  return {
    length: pw.length >= 12,
    letter: /[a-zA-Z]/.test(pw),
    number: /[0-9]/.test(pw)
  };
}
