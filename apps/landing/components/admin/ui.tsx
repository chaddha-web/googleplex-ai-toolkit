"use client";

/**
 * Brand primitives for the admin shell — the liquid-glass equivalents of the
 * shadcn card / stat / badge / confirm-dialog patterns. Kept dependency-free so
 * nothing dictates the aesthetic. Reused by every admin page as we migrate.
 */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const COIN_STYLE: Record<string, { bg: string; content: string; dark?: boolean }> = {
  USDT: { bg: "#26A17B", content: "₮" },
  USDC: { bg: "#2775CA", content: "$" },
  BNB: { bg: "#F3BA2F", content: "BNB", dark: true },
  TRX: { bg: "#EB0029", content: "TRX" },
  ETH: { bg: "#627EEA", content: "Ξ" },
  BTC: { bg: "#F7931A", content: "₿" },
  PARTY: { bg: "#8A68FF", content: "P" }
};

/** Brand-colored coin mark. Self-contained (no external logo assets). */
export function CoinIcon({ symbol, size = 26 }: { symbol: string; size?: number }) {
  const c = COIN_STYLE[symbol] ?? { bg: "#3f3f46", content: symbol.slice(0, 3) };
  const fontSize = c.content.length > 1 ? Math.round(size * 0.34) : Math.round(size * 0.5);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, background: c.bg, color: c.dark ? "#1a1a1a" : "#fff", fontSize }}
      aria-hidden="true"
    >
      {c.content}
    </span>
  );
}

export function Surface({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("liquid-glass rounded-2xl", className)}>{children}</div>;
}

const TONE_TEXT = {
  default: "text-white",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300"
} as const;

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof TONE_TEXT;
  href?: string;
}) {
  const inner = (
    <div className="liquid-glass rounded-2xl px-5 py-4 h-full">
      <p className="text-white/40 text-[11px] tracking-[0.2em] uppercase">{label}</p>
      <p className={cn("mt-2 text-3xl font-light", TONE_TEXT[tone])}>{value}</p>
      {hint != null && <p className="mt-1 text-white/40 text-xs">{hint}</p>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

const BADGE_TONE = {
  emerald: "bg-emerald-400/[0.13] text-emerald-300",
  rose: "bg-rose-400/[0.13] text-rose-300",
  amber: "bg-amber-400/[0.14] text-amber-300",
  neutral: "bg-white/10 text-white/60"
} as const;

export function StatusBadge({
  tone = "neutral",
  children
}: {
  tone?: keyof typeof BADGE_TONE;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px]", BADGE_TONE[tone])}>
      {children}
    </span>
  );
}

/**
 * Destructive-action confirmation. Optional `requireText` forces the admin to
 * type an exact string (e.g. the member's code11) before the confirm enables —
 * the friction pattern we want on suspend / flush / withdrawals.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "default",
  requireText,
  busy,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  if (!open) return null;
  const ok = !requireText || typed.trim() === requireText;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-2xl tracking-tight text-white">{title}</h3>
        {body != null && <div className="mt-3 text-white/60 text-sm leading-relaxed">{body}</div>}
        {requireText && (
          <div className="mt-4">
            <p className="text-white/40 text-xs mb-1.5">
              Type <span className="font-mono text-white/70">{requireText}</span> to confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
            />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white text-sm px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ok || busy}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-40",
              tone === "danger"
                ? "bg-rose-500/90 text-white hover:bg-rose-500"
                : "bg-white text-black hover:bg-white/90"
            )}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
