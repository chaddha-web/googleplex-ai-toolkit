"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { submitProfile } from "@/lib/auth-client";

/**
 * Step 1 of post-OTP onboarding.
 *
 * Collects: age (18+), country, gender (optional), consent to T&C +
 * Privacy (required), notifications opt-in (optional). After submit
 * sends user to /app/setup/wallet for the wallet-now-or-later choice.
 */

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Singapore",
  "United Arab Emirates",
  "Germany",
  "France",
  "Netherlands",
  "Brazil",
  "Mexico",
  "Japan",
  "South Korea",
  "Nigeria",
  "South Africa",
  "Other"
];

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Other" }
];

export default function ProfileSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [age, setAge] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNum = Number(age);
  const ageValid = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 120;
  const canSubmit =
    !loading && ageValid && !!country && consentTerms && consentPrivacy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await submitProfile({
        age: Math.floor(ageNum),
        country,
        gender: gender || null,
        consentTerms: true,
        consentPrivacy: true,
        notificationsOptIn: notifications
      });
      router.push("/app/setup/wallet"); // step 2: now-or-later choice
    } catch (err) {
      setError((err as Error).message || "Could not save your profile.");
    } finally {
      setLoading(false);
    }
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
          Step 1 of 2 · About you
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.05 }}
          className="font-serif text-white tracking-tight text-5xl md:text-6xl leading-[1.05]"
        >
          A few <em className="font-serif-i text-white/60">basics</em>
          {user?.firstName ? `, ${user.firstName}` : ""}.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-white/70 text-base md:text-lg leading-relaxed mt-6"
        >
          We only collect what we need to keep the platform compliant and
          your account safe. None of this is shared with third parties — see
          our <Link href="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          onSubmit={handleSubmit}
          className="mt-12 space-y-6"
          noValidate
        >
          {/* Age */}
          <div className="space-y-2">
            <label htmlFor="age" className="text-sm font-medium text-white block">
              Age
            </label>
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={18}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="18+"
              required
              className="bg-[#1A1A1A] border-none rounded-xl w-full h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 transition-shadow"
            />
            {age && !ageValid ? (
              <p className="text-xs text-rose-300/80">You must be 18 or older.</p>
            ) : null}
          </div>

          {/* Country */}
          <div className="space-y-2">
            <label htmlFor="country" className="text-sm font-medium text-white block">
              Country / region
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              className="bg-[#1A1A1A] border-none rounded-xl w-full h-11 px-4 text-white focus:ring-2 focus:ring-white/20 transition-shadow appearance-none"
            >
              <option value="" disabled>
                Select your country
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Gender (optional) */}
          <div className="space-y-2">
            <label htmlFor="gender" className="text-sm font-medium text-white block">
              Gender <span className="text-white/30 font-normal">— optional</span>
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="bg-[#1A1A1A] border-none rounded-xl w-full h-11 px-4 text-white focus:ring-2 focus:ring-white/20 transition-shadow appearance-none"
            >
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Consents */}
          <div className="liquid-glass rounded-2xl p-5 space-y-3">
            <ConsentCheckbox
              id="consent-terms"
              checked={consentTerms}
              onChange={setConsentTerms}
              label={
                <>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline hover:text-white">
                    Terms &amp; Conditions
                  </Link>
                  .
                </>
              }
            />
            <ConsentCheckbox
              id="consent-privacy"
              checked={consentPrivacy}
              onChange={setConsentPrivacy}
              label={
                <>
                  I&apos;ve read the{" "}
                  <Link href="/privacy" target="_blank" className="underline hover:text-white">
                    Privacy Policy
                  </Link>
                  .
                </>
              }
            />
            <ConsentCheckbox
              id="consent-notif"
              checked={notifications}
              onChange={setNotifications}
              label={
                <>
                  Send me product updates and account notifications.{" "}
                  <span className="text-white/40">Optional.</span>
                </>
              }
            />
          </div>

          {error ? (
            <p className="text-sm text-rose-300/90">{error}</p>
          ) : null}

          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Saving…" : "Continue →"}
            </button>
          </div>
        </motion.form>
      </section>
    </main>
  );
}

function ConsentCheckbox({
  id,
  checked,
  onChange,
  label
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#1A1A1A] text-white focus:ring-white/20"
      />
      <span className="text-sm text-white/80 group-hover:text-white transition-colors leading-relaxed">
        {label}
      </span>
    </label>
  );
}
