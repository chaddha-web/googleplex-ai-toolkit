"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { AuthHero } from "@/components/auth-hero";
import { OtpCells } from "@/components/otp-cells";
import { ArrowLeft } from "@/components/icons";
import { newIdempotencyKey } from "@/lib/fetch-retry";
import { requestOtp, verifyOtp } from "@/lib/auth-client";

function FormRight() {
  const router = useRouter();
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestKeyRef = useRef<string>(newIdempotencyKey());

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    requestKeyRef.current = newIdempotencyKey();
    try {
      await requestOtp({
        email,
        mode: "login",
        idempotencyKey: requestKeyRef.current
      });
      setStage("verify");
      setOtp(["", "", "", "", "", ""]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyOtp({ email, code: otp.join("") });
      if (!user.profileCompletedAt) {
        router.push("/app/setup/profile");
      } else {
        router.push(user.role === "admin" ? "/app/admin" : "/app");
      }
    } catch (err) {
      const e = err as Error & { attemptsLeft?: number };
      setError(e.message || "Could not verify the code.");
      if (e.attemptsLeft === undefined) setOtp(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setOtp(["", "", "", "", "", ""]);
    setError(null);
    setLoading(true);
    requestKeyRef.current = newIdempotencyKey();
    try {
      await requestOtp({
        email,
        mode: "login",
        idempotencyKey: requestKeyRef.current
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-xl space-y-8 lg:space-y-6 sm:space-y-10"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors"
        >
          <ArrowLeft size={14} /> Back to home
        </Link>

        {stage === "request" ? (
          <>
            <div className="space-y-2">
              <h2 className="text-3xl font-medium tracking-tight">
                Sign in to your account
              </h2>
              <p className="text-white/40 text-sm">
                Enter your email — we&apos;ll send a one-time code to sign you
                in.
              </p>
            </div>

            <form onSubmit={handleRequest} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-white block"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@googolplex.studio"
                  className="bg-[#1A1A1A] border-none rounded-xl h-11 w-full px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 transition-shadow"
                />
              </div>

              {error && (
                <p className="text-red-300/90 text-xs leading-relaxed">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending…" : "Request OTP"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="text-3xl font-medium tracking-tight">
                Enter your code
              </h2>
              <p className="text-white/40 text-sm">
                We sent a 6-digit code to{" "}
                <span className="text-white/80">{email || "your email"}</span>.
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <OtpCells value={otp} onChange={setOtp} />

              {error && (
                <p className="text-red-300/90 text-xs text-center">{error}</p>
              )}

              <p className="text-xs text-white/40 text-center">
                Didn&apos;t get it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-white hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </p>

              <button
                type="submit"
                disabled={otp.some((d) => !d) || loading}
                className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStage("request");
                  setOtp(["", "", "", "", "", ""]);
                  setError(null);
                }}
                className="w-full text-xs text-white/50 hover:text-white transition-colors"
              >
                ← Use a different email
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-white/50">
          New to GoogolPlex?{" "}
          <Link
            href="/signup"
            className="text-white font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4">
      <AuthHero
        heading="Welcome back"
        tagline="Step into your studio with a single sign-in."
        steps={[
          { number: 1, text: "Sign in securely" },
          { number: 2, text: "Pick up where you left off" },
          { number: 3, text: "Continue creating" }
        ]}
      />
      <FormRight />
    </main>
  );
}
