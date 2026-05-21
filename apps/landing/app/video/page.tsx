import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooterCard } from "@/components/site-footer-card";

export const metadata = {
  title: "The Film — GoogolPlex",
  description: "Watch the full GoogolPlex render and download the full-size video."
};

// Served by the nginx `media` container at /media/* (same origin in prod).
const VIDEO_SRC = "/media/Googolplex_render_V8.mp4";
const VIDEO_FILE = "Googolplex_render_V8.mp4";

export default function VideoPage() {
  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans bg-black text-white">
      <div className="relative z-10 w-full max-w-6xl flex flex-col items-center flex-1">
        <SiteNav />

        <section className="w-full px-6 pt-8 md:pt-12 pb-24">
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase">
            The Film
          </p>
          <h1 className="font-serif text-5xl md:text-7xl tracking-tight mt-2">
            GoogolPlex, <em className="font-serif-i text-white/60">in motion</em>.
          </h1>
          <p className="text-white/60 text-base md:text-lg leading-relaxed mt-6 max-w-2xl">
            Stream the full render below, or download the original full-size
            file to keep.
          </p>

          {/* Player */}
          <div className="mt-10 rounded-3xl overflow-hidden ring-1 ring-white/10 bg-black">
            <video
              controls
              playsInline
              preload="metadata"
              className="w-full h-auto block"
            >
              <source src={VIDEO_SRC} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Download */}
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
            <a
              href={VIDEO_SRC}
              download={VIDEO_FILE}
              className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-black text-sm font-semibold transition-colors hover:opacity-90"
              style={{ background: "#d6ee4f" }}
            >
              ↓ Download full-size video
            </a>
            <Link
              href="/"
              className="text-white/50 hover:text-white text-sm transition-colors"
            >
              ← Back to home
            </Link>
          </div>

          <p className="text-white/30 text-xs mt-4">
            Full-size MP4 · ~1.5&nbsp;GB. Download time depends on your
            connection.
          </p>
        </section>
      </div>

      <div className="relative z-10 w-full px-6 pb-10 max-w-7xl mx-auto">
        <SiteFooterCard />
      </div>
    </main>
  );
}
