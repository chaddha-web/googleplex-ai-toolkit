"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft, ArrowRight } from "@/components/icons";

type Severity = "low" | "medium" | "high" | "critical";

const SEVERITIES: { value: Severity; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Cosmetic, minor copy, nice-to-have" },
  { value: "medium", label: "Medium", hint: "Annoying but doesn't block the flow" },
  { value: "high", label: "High", hint: "Breaks a key feature for me" },
  { value: "critical", label: "Critical", hint: "Money, security, or data integrity" }
];

export default function ReportPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire to backend /api/reports when ready
    setSubmitted(true);
  }

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white bg-black">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_rgba(180,140,255,0.05)_0%,_transparent_60%)]" />

      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center flex-1">
        <SiteNav />

        <section className="w-full px-6 pt-12 md:pt-24 pb-24 md:pb-40 max-w-3xl">
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
            Report a concern
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 }}
            className="font-serif text-white tracking-tight text-5xl md:text-7xl leading-[1.05]"
          >
            Something <em className="font-serif-i text-white/60">off</em>?
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/70 text-base md:text-lg leading-relaxed mt-8"
          >
            Found a bug, security concern, or content that shouldn&apos;t be
            here — let us know. Critical reports get a same-day response.
          </motion.p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="liquid-glass rounded-3xl mt-12 p-8"
            >
              <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
                Report received
              </p>
              <h2 className="font-serif text-3xl md:text-4xl tracking-tight">
                Thanks — we&apos;re <em className="font-serif-i text-white/60">on it</em>.
              </h2>
              <p className="text-white/60 text-sm leading-relaxed mt-4">
                We&apos;ve logged your report with severity <span className="text-white/80 uppercase tracking-widest">{severity}</span>.
                {email ? <> You&apos;ll hear back at <span className="text-white/80">{email}</span>.</> : null}
              </p>
            </motion.div>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              onSubmit={handleSubmit}
              className="mt-12 space-y-6"
            >
              {/* Severity picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white block">
                  Severity
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SEVERITIES.map((s) => {
                    const active = severity === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSeverity(s.value)}
                        className={`text-left rounded-2xl p-4 transition-all ${
                          active
                            ? "bg-white text-black ring-2 ring-white"
                            : "bg-[#1A1A1A] text-white ring-1 ring-white/10 hover:bg-white/5"
                        }`}
                      >
                        <p className="text-sm font-semibold uppercase tracking-widest">
                          {s.label}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            active ? "text-black/60" : "text-white/40"
                          }`}
                        >
                          {s.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Short title" value={title} onChange={setTitle} placeholder="What went wrong, in one line" required />
              <Field
                label="Describe the issue"
                value={description}
                onChange={setDescription}
                placeholder="What did you do? What did you expect? What actually happened?"
                required
                multiline
              />
              <Field
                label="Your email (optional)"
                value={email}
                onChange={setEmail}
                type="email"
                placeholder="If you want us to write back"
              />

              <button
                type="submit"
                className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2"
              >
                Send report <ArrowRight size={16} />
              </button>
            </motion.form>
          )}
        </section>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto">
        <SiteFooterCard />
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  const cls =
    "bg-[#1A1A1A] border-none rounded-xl w-full px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 transition-shadow";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-white block">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={6}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} py-3 resize-none`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} h-11`}
        />
      )}
    </div>
  );
}
