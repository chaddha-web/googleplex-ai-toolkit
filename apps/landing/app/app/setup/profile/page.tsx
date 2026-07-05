"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { submitProfile } from "@/lib/auth-client";
import { LoopVideo } from "@/components/video";
import { VIDEOS } from "@/lib/assets";

/**
 * Step 1 of post-OTP onboarding.
 *
 * Collects: age (18+), country, gender (optional), consent to T&C +
 * Privacy (required), the consultation-fee acknowledgement (required), and
 * notifications opt-in (optional). Sits over the hero starfield video for
 * visual continuity with the landing page. After submit → /app/setup/wallet.
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
  const [consentConsultation, setConsentConsultation] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNum = Number(age);
  const ageValid = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 120;
  const canSubmit =
    !loading &&
    ageValid &&
    !!country &&
    consentTerms &&
    consentPrivacy &&
    consentConsultation;

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

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
        consentConsultation: true,
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
      {/* Hero starfield video — continuity with the landing page. */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LoopVideo
          src={VIDEOS.hero}
          eager
          placeholderClass="placeholder-video"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(180,140,255,0.10)_0%,_transparent_62%)]" />
      </div>

      <section className="relative z-10 w-full max-w-2xl px-6 pt-16 md:pt-24 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white/50 text-xs tracking-[0.3em] uppercase mb-6"
        >
          Step 1 of 2 · About you
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.05 }}
          className="font-serif text-white tracking-tight text-5xl md:text-6xl leading-[1.05] [text-shadow:0_2px_30px_rgba(0,0,0,0.5)]"
        >
          A few <em className="font-serif-i text-white/70">basics</em>
          {user?.firstName ? `, ${user.firstName}` : ""}.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-white/75 text-base md:text-lg leading-relaxed mt-6"
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
          className="mt-10 liquid-glass rounded-3xl p-6 md:p-8 space-y-6"
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
              className="bg-white/5 border border-white/10 rounded-xl w-full h-12 px-4 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-2 focus:ring-white/10 outline-none transition"
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
              className="bg-white/5 border border-white/10 rounded-xl w-full h-12 px-4 text-white focus:border-white/30 focus:ring-2 focus:ring-white/10 outline-none transition appearance-none [color-scheme:dark]"
            >
              <option value="" disabled className="bg-[#14122e] text-white/60">
                Select your country
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c} className="bg-[#14122e] text-white">
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
              className="bg-white/5 border border-white/10 rounded-xl w-full h-12 px-4 text-white focus:border-white/30 focus:ring-2 focus:ring-white/10 outline-none transition appearance-none [color-scheme:dark]"
            >
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value} className="bg-[#14122e] text-white">
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Consultation-fee disclosure — must be read + signed. */}
          <ConsultationConsent
            checked={consentConsultation}
            onChange={setConsentConsultation}
            signerName={fullName}
            today={today}
          />

          {/* Consents */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
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
              className="rounded-full px-8 py-3.5 bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Saving…" : "Continue →"}
            </button>
          </div>
        </motion.form>
      </section>
    </main>
  );
}

/**
 * Consultation-fee acknowledgement. The client requires that members clearly
 * see and sign that a US$200,000 consultation fee applies once they begin
 * earning — never billed directly, only recovered from platform revenue share
 * and/or the tokens issued to them.
 */
function ConsultationConsent({
  checked,
  onChange,
  signerName,
  today
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  signerName: string;
  today: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-300/25 bg-gradient-to-b from-amber-200/[0.06] to-transparent p-5 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-200/90 text-[10px] tracking-[0.3em] uppercase">
          Consultation agreement
        </span>
        <span className="h-px flex-1 bg-amber-300/15" />
      </div>

      <p className="text-white/85 text-sm leading-relaxed">
        By building and earning with GoogolPlex, you agree that a one-time
        consultation fee of{" "}
        <span className="text-amber-100 font-semibold">US$200,000</span> is
        payable to GoogolPlex for the strategy, tooling, and platform access
        provided to you.
      </p>
      <ul className="mt-3 space-y-1.5 text-white/70 text-sm leading-relaxed">
        <li className="flex gap-2">
          <span className="text-amber-200/80">•</span>
          <span>
            It is <span className="text-white font-medium">never billed or
            charged to you directly</span>, and needs no upfront or
            out-of-pocket payment.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-amber-200/80">•</span>
          <span>
            It is recovered <span className="text-white font-medium">only</span>{" "}
            from the value the platform helps you create — deducted from your
            platform revenue share and/or settled through the tokens issued to
            you.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-amber-200/80">•</span>
          <span>Collection happens only as and when you earn. If you never earn, nothing is collected.</span>
        </li>
      </ul>

      <label
        htmlFor="consent-consultation"
        className="mt-4 flex items-start gap-3 cursor-pointer group border-t border-amber-300/15 pt-4"
      >
        <input
          id="consent-consultation"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-amber-400 focus:ring-amber-300/30"
        />
        <span className="text-sm text-white/85 group-hover:text-white transition-colors leading-relaxed">
          I have read, understood, and agree to the consultation-fee terms
          above. <span className="text-amber-200/80">Required.</span>
        </span>
      </label>

      {/* Signature line — appears once acknowledged, so consent reads as signed. */}
      {checked && (
        <p className="mt-3 text-xs text-white/45">
          Signed{signerName ? ` — ${signerName}` : ""} · {today}
        </p>
      )}
    </div>
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
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-white focus:ring-white/20"
      />
      <span className="text-sm text-white/80 group-hover:text-white transition-colors leading-relaxed">
        {label}
      </span>
    </label>
  );
}
