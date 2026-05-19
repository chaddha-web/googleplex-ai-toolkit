"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Facebook,
  Instagram,
  Music2,
  Twitter,
  Youtube
} from "@/components/icons";

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

/**
 * The liquid-glass footer card used by both the landing footer section
 * (over its video CTA) and the 404 page (over its drifting starfield).
 */
export function SiteFooterCard({ className = "" }: { className?: string }) {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
      className={`liquid-glass w-full rounded-3xl p-6 md:p-10 text-white/70 ${className}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3 mb-4 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt="GoogolPlex"
              className="h-7 w-auto object-contain"
            />
            <span className="text-xl font-medium tracking-tight">GoogolPlex</span>
          </div>
          <p className="text-sm leading-relaxed max-w-sm">
            GoogolPlex builds calm, premium experiences for teams who treat
            clarity as a craft — research, design and content, shared with
            intent.
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
          © 2026 GoogolPlex — All rights reserved
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
  );
}
