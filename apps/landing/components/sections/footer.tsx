"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Facebook, Instagram, Music2, Twitter, Youtube } from "@/components/icons";
import { FooterBgVideo } from "@/components/video";
import { VIDEOS } from "@/lib/assets";

type LinkItem = { label: string; href: string };

const discover: LinkItem[] = [
  { label: "Labs & Workshops", href: "#" },
  { label: "Deep Dive Series", href: "#" },
  { label: "Global Circle", href: "#" },
  { label: "Resource Vault", href: "#" },
  { label: "Future Roadmap", href: "#" }
];
const mission: LinkItem[] = [
  { label: "Origin Story", href: "/about" },
  { label: "The Collective", href: "#" },
  { label: "Newsroom Hub", href: "#" },
  { label: "Join the Team", href: "#" }
];
const concierge: LinkItem[] = [
  { label: "Get in Touch", href: "/contact" },
  { label: "Legal Privacy", href: "/privacy" },
  { label: "User Agreement", href: "/terms" },
  { label: "Report Concern", href: "/report" }
];

function Column({ title, items }: { title: string; items: LinkItem[] }) {
  return (
    <div>
      <h4 className="text-sm uppercase tracking-wider text-white font-medium mb-4">
        {title}
      </h4>
      <ul className="text-xs space-y-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="hover:text-white transition-colors">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <section id="contact" className="relative w-full overflow-hidden bg-black min-h-[100vh] flex flex-col scroll-mt-24">
      <FooterBgVideo src={VIDEOS.footer} />
      <div className="absolute inset-0 bg-black/25 z-[1] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/60 to-transparent z-[1] pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-28 md:pt-40 pb-12">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="text-white text-4xl md:text-6xl lg:text-7xl tracking-tight max-w-4xl font-sans font-medium"
        >
          Mother First. By Design.
        </motion.h2>

        <motion.form
          onSubmit={(e) => e.preventDefault()}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
          className="liquid-glass rounded-full pl-6 pr-2 py-2 mt-10 max-w-xl w-full flex items-center gap-3"
        >
          <input
            type="email"
            placeholder="Your favorite email"
            className="flex-1 bg-transparent text-white placeholder:text-white/50 text-sm py-2"
          />
          <button
            type="submit"
            className="bg-[#1a2440] hover:bg-[#22305a] transition-colors text-white rounded-full px-6 py-3 text-xs font-medium tracking-[2px]"
          >
            STAY NOTIFIED
          </button>
        </motion.form>
      </div>

      <div className="relative z-10 w-full px-4 md:px-6 pb-4 md:pb-6">
        <motion.footer
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
          className="liquid-glass w-full rounded-3xl p-6 md:p-10 text-white/70"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3 mb-4 text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="GoogolPlex"
                  className="h-7 w-auto object-contain"
                />
                <span className="text-xl font-medium tracking-tight">GOOGOLPLEX</span>
              </div>
              <p className="text-sm leading-relaxed max-w-sm">
                Googolplex provides premium clarity on Web3, social, and AI — built
                in the open, governed by the community, shared with all.
              </p>
            </div>

            <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-8">
              <Column title="Discover" items={discover} />
              <Column title="The Mission" items={mission} />
              <Column title="Concierge" items={concierge} />
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
            <p className="text-[10px] uppercase tracking-widest opacity-50">
              Built by Fit Tech Collectives
            </p>
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-widest opacity-50">
                Join the journey:
              </span>
              <div className="flex items-center gap-3">
                {[Music2, Facebook, Twitter, Youtube, Instagram].map((Ico, i) => (
                  <a
                    key={i}
                    href="#"
                    aria-label="Social link"
                    className="opacity-70 hover:opacity-100 transition-colors hover:text-white"
                  >
                    <Ico size={16} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </motion.footer>
      </div>
    </section>
  );
}
