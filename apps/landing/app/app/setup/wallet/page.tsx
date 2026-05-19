"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";

const SKIP_KEY = "gplex.skip_wallet_setup_seen";

/**
 * Step 2 of post-OTP onboarding.
 *
 * Asks the user whether to set up their wallet now (password → $1 deposit)
 * or skip and use the platform in read-only mode. The skip choice is sticky
 * (localStorage flag) so the gate won't keep bouncing them back here.
 */
export default function WalletSetupChoice() {
  const router = useRouter();
  const { user } = useAuth();

  function chooseNow() {
    if (typeof window !== "undefined") {
      // Forget the skip preference if they come back to do it.
      localStorage.removeItem(SKIP_KEY);
    }
    router.push("/app/setup/password");
  }

  function chooseLater() {
    if (typeof window !== "undefined") {
      localStorage.setItem(SKIP_KEY, "1");
    }
    router.push("/app");
  }

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans bg-black text-white selection:bg-white/20 selection:text-white">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(180,140,255,0.06)_0%,_transparent_60%)]" />

      <section className="relative z-10 w-full max-w-2xl px-6 pt-16 md:pt-24 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
        >
          Step 2 of 2 · Your wallet
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.05 }}
          className="font-serif text-white tracking-tight text-5xl md:text-6xl leading-[1.05]"
        >
          One last <em className="font-serif-i text-white/60">choice</em>
          {user?.firstName ? `, ${user.firstName}` : ""}.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-white/70 text-base md:text-lg leading-relaxed mt-6"
        >
          Your wallet unlocks the things that move money — publishing in Studio,
          joining a Community, voting with stake. You can set it up now or do it
          later from your dashboard.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <ChoiceCard
            eyebrow="Recommended"
            title={<>Set up <em className="font-serif-i text-white/60">now</em></>}
            body="Pick a wallet password, then send $1 in USDT or USDC to activate. Takes 2 minutes."
            ctaLabel="Set up wallet →"
            primary
            onClick={chooseNow}
          />
          <ChoiceCard
            eyebrow="No rush"
            title={<>I&apos;ll do it <em className="font-serif-i text-white/60">later</em></>}
            body="Browse Studio and Community in read-only mode. You can comment and vote. Finish the wallet anytime from your dashboard."
            ctaLabel="Take me to the dashboard →"
            onClick={chooseLater}
          />
        </motion.div>

        <p className="mt-8 text-white/40 text-xs leading-relaxed">
          Why the $1?{" "}
          <span className="text-white/60">
            A one-time activation deposit blocks automated bot signups and
            funds the gas for your first on-chain action. It stays in your
            wallet — we don&apos;t take a cut.
          </span>{" "}
          <Link href="/terms" className="underline hover:text-white">
            Terms
          </Link>
        </p>
      </section>
    </main>
  );
}

function ChoiceCard({
  eyebrow,
  title,
  body,
  ctaLabel,
  onClick,
  primary
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  ctaLabel: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left liquid-glass rounded-3xl p-6 md:p-7 transition-all hover:bg-white/5 group ${
        primary ? "ring-1 ring-white/30" : "ring-1 ring-white/10"
      }`}
    >
      <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-3">
        {eyebrow}
      </p>
      <h3 className="font-serif text-2xl md:text-3xl tracking-tight mb-3">
        {title}
      </h3>
      <p className="text-white/60 text-sm leading-relaxed mb-6">{body}</p>
      <span className="text-white text-sm font-medium group-hover:translate-x-1 inline-block transition-transform">
        {ctaLabel}
      </span>
    </button>
  );
}

export { SKIP_KEY };
