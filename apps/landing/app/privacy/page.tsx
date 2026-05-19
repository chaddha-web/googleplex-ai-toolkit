"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft } from "@/components/icons";

const sections = [
  {
    title: "What we collect",
    body:
      "When you create a GoogolPlex account we collect your name, email address, and the data you choose to add to your profile. We collect deposit and withdrawal addresses, on-chain transaction hashes you authorise, and the timestamp of every action you take inside the platform. We do not collect biometric data, location data, or anything you do outside GoogolPlex."
  },
  {
    title: "Why we collect it",
    body:
      "To run the product: authenticate you, route deposits to your balance, process withdrawals, prevent fraud, and respond to your support requests. We use a small set of operational vendors (Resend for email, AWS KMS for key custody, Anthropic for AI features) and the minimum data they need is shared with them under their published privacy terms."
  },
  {
    title: "Who we share it with",
    body:
      "Nobody, except the operational vendors above and where compelled by valid legal process. We do not sell, rent, or trade personal data, ever. Aggregate, fully-anonymised metrics may be published in our own materials."
  },
  {
    title: "How long we keep it",
    body:
      "Account data for as long as your account exists, plus 30 days after deletion to honour withdrawal cooldowns and audit obligations. Transaction history is retained for 7 years for regulatory compliance. Server logs are rotated weekly."
  },
  {
    title: "Your rights",
    body:
      "You can request a full export of your data at any time. You can correct any field you can see in the dashboard yourself. You can request deletion of your account; this severs your access, removes your profile, and pseudonymises the audit trail."
  },
  {
    title: "Cookies",
    body:
      "We use first-party cookies for sign-in (refresh token), to skip a video preloader on return visits, and to remember an access-gate state during pre-launch. We do not use third-party tracking cookies. We do not run advertising pixels."
  },
  {
    title: "Contact",
    body:
      "Questions about this policy or how we handle your data — write to start@ggakingclub.com and the team will reply within one working day."
  }
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Privacy Policy"
      title={
        <>
          Calm by <em className="font-serif-i text-white/60">design</em>.
        </>
      }
      intro="We collect only what we need to run the product, share none of it for marketing, and tell you exactly what's happening with it."
      updated="Last updated · 19 May 2026"
      sections={sections}
    />
  );
}

export function LegalLayout({
  eyebrow,
  title,
  intro,
  updated,
  sections
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
  updated: string;
  sections: { title: string; body: string }[];
}) {
  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white bg-black">
      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center flex-1">
        <SiteNav />

        <article className="w-full px-6 pt-12 md:pt-20 pb-24 md:pb-32 max-w-3xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs transition-colors mb-12"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
          >
            {eyebrow}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 }}
            className="font-serif text-white tracking-tight text-5xl md:text-7xl leading-[1.05]"
          >
            {title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/70 text-base md:text-lg leading-relaxed mt-8"
          >
            {intro}
          </motion.p>

          <p className="text-white/30 text-[10px] tracking-[0.3em] uppercase mt-6">
            {updated}
          </p>

          <div className="mt-16 space-y-12">
            {sections.map((s, i) => (
              <motion.section
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.06 }}
                className="border-t border-white/10 pt-8"
              >
                <h2 className="font-serif text-white text-2xl md:text-3xl tracking-tight mb-3">
                  {s.title}
                </h2>
                <p className="text-white/70 text-base leading-relaxed">{s.body}</p>
              </motion.section>
            ))}
          </div>
        </article>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto">
        <SiteFooterCard />
      </div>
    </main>
  );
}
