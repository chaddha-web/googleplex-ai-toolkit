"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { setWalletPassword, requestOtp, verifyOtp } from "@/lib/auth-client";

/**
 * Wallet activation step 1: set a wallet password, then re-verify identity via
 * an emailed OTP. On success → deposit page. Lives in the web app so it's
 * same-origin as the dashboard (no cross-origin session bounce to login).
 */
export default function PasswordSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [stage, setStage] = useState<"password" | "otp">("password");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checks = useMemo(() => evaluate(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = checks.length && checks.letter && checks.number && matches && !loading;

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !user) return;
    setError(null);
    setLoading(true);
    try {
      await setWalletPassword(password);
      // Re-verify identity via OTP before allowing the deposit step.
      await requestOtp({ email: user.email, mode: "login" });
      setStage("otp");
    } catch (err) {
      setError((err as Error).message || "Could not save your wallet password.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!user || code.trim().length < 6 || loading) return;
    setError(null);
    setLoading(true);
    try {
      await verifyOtp({ email: user.email, code: code.trim() });
      router.push("/setup/deposit");
    } catch (err) {
      setError((err as Error).message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex flex-col items-center font-sans bg-black text-white">
      <section className="w-full max-w-xl px-6 pt-16 md:pt-24 pb-24">
        <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs mb-10">
          ← Dashboard
        </Link>

        <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6">
          Wallet · {stage === "password" ? "1 of 3" : "2 of 3"}
        </p>

        {stage === "password" ? (
          <>
            <h1 className="font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
              Pick a wallet <em className="font-serif-i text-white/60">password</em>.
            </h1>
            <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6">
              Used to sign sensitive actions — withdrawals, transfers, recovery.
              We never see the plaintext; only an argon2id hash.
            </p>

            <form onSubmit={savePassword} className="mt-12 space-y-6">
              <Field id="password" label="Wallet password" type={show ? "text" : "password"} value={password} onChange={setPassword} placeholder="At least 12 characters" autoComplete="new-password" />
              <Field id="confirm" label="Confirm password" type={show ? "text" : "password"} value={confirm} onChange={setConfirm} placeholder="Re-enter the same password" autoComplete="new-password" />
              <label className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 cursor-pointer">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-3.5 w-3.5" />
                Show password
              </label>
              <div className="liquid-glass rounded-2xl p-4 space-y-1.5">
                <Rule ok={checks.length}>At least 12 characters</Rule>
                <Rule ok={checks.letter}>Contains a letter</Rule>
                <Rule ok={checks.number}>Contains a number</Rule>
                <Rule ok={matches}>Passwords match</Rule>
              </div>
              {error && <p className="text-sm text-rose-300/90">{error}</p>}
              <button type="submit" disabled={!canSubmit} className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? "Saving…" : "Save & verify →"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
              Verify it&apos;s <em className="font-serif-i text-white/60">you</em>.
            </h1>
            <p className="text-white/70 text-base md:text-lg leading-relaxed mt-6">
              We sent a 6-digit code to <span className="text-white">{user?.email}</span>. Enter
              it to continue to your deposit wallet.
            </p>
            <form onSubmit={confirmOtp} className="mt-12 space-y-6">
              <Field id="code" label="Email code" type="text" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="123456" autoComplete="one-time-code" />
              {error && <p className="text-sm text-rose-300/90">{error}</p>}
              <button type="submit" disabled={code.trim().length < 6 || loading} className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? "Verifying…" : "Verify & continue →"}
              </button>
            </form>
          </>
        )}

        <p className="mt-10 text-white/30 text-xs">
          Signed in as <span className="text-white/60">{user?.email}</span>
        </p>
      </section>
    </main>
  );
}

function Field({ id, label, type, value, onChange, placeholder, autoComplete }: { id: string; label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-white block">{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} required className="bg-[#1A1A1A] border-none rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20" />
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-white/20"}`} />
      <span className={ok ? "text-white/80" : "text-white/40"}>{children}</span>
    </div>
  );
}

function evaluate(pw: string) {
  return { length: pw.length >= 12, letter: /[a-zA-Z]/.test(pw), number: /[0-9]/.test(pw) };
}
