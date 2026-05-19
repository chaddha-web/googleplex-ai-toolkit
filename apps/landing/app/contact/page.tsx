"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";
import { ArrowLeft, ArrowRight } from "@/components/icons";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire to backend /api/contact when ready
    setSubmitted(true);
  }

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans selection:bg-white/20 selection:text-white bg-black">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.05)_0%,_transparent_60%)]" />
      <div className="fixed inset-0 z-[1] pointer-events-none stars" />

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
            Get in touch
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05 }}
            className="font-serif text-white tracking-tight text-5xl md:text-7xl leading-[1.05]"
          >
            We&apos;re <em className="font-serif-i text-white/60">listening</em>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/70 text-base md:text-lg leading-relaxed mt-8"
          >
            Partnerships, press, support — drop a note and a human will write
            back, usually within one working day.
          </motion.p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="liquid-glass rounded-3xl mt-12 p-8 text-center"
            >
              <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3">
                Message received
              </p>
              <h2 className="font-serif text-3xl md:text-4xl tracking-tight">
                Thank you, <span className="font-serif-i text-white/60">{name || "friend"}</span>.
              </h2>
              <p className="text-white/60 text-sm leading-relaxed mt-4">
                We&apos;ll be in touch at <span className="text-white/80">{email}</span> shortly.
              </p>
            </motion.div>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              onSubmit={handleSubmit}
              className="mt-12 space-y-5"
            >
              <Field label="Your name" value={name} onChange={setName} placeholder="Jane Doe" required />
              <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="jane@example.com" required />
              <Field
                label="Message"
                value={message}
                onChange={setMessage}
                placeholder="What can we help with?"
                required
                multiline
              />

              <button
                type="submit"
                className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2"
              >
                Send message <ArrowRight size={16} />
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
          rows={5}
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
