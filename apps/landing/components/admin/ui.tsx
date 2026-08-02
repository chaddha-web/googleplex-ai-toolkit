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
  POL: { bg: "#8247E5", content: "POL" },
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

const MEDIA_COINS = "https://ggakingclub.com/media/coins";
const LOGO_EXT: Record<string, string> = { PARTY: "png" };

/** Real self-hosted coin logo (same media bucket the member wallet uses), with a
 *  brand-glyph fallback if the image is missing. */
export function TokenLogo({ symbol, size = 26 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const sym = symbol.toUpperCase();
  if (failed) return <CoinIcon symbol={sym} size={size} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${MEDIA_COINS}/${sym.toLowerCase()}.${LOGO_EXT[sym] ?? "svg"}`}
      alt={sym}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

const CHAIN_NATIVE: Record<string, string> = { eth: "ETH", bsc: "BNB", polygon: "POL", tron: "TRX", btc: "BTC" };

/** A chain's badge = its native-coin logo (BSC→BNB, POLYGON→POL, TRON→TRX, ETH→ETH, BTC→BTC). */
export function ChainBadge({ chain, size = 16 }: { chain: string; size?: number }) {
  return <TokenLogo symbol={CHAIN_NATIVE[chain.toLowerCase()] ?? chain} size={size} />;
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

// ── Loading feedback ────────────────────────────────────────────────────────
// Every async action should show that something is happening. A silent UI that
// is quietly working reads as a broken one.

/** Inline spinner. Inherits `currentColor`, so it works on any button. */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block rounded-full animate-spin align-[-2px]", className)}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 7)),
        borderStyle: "solid",
        borderColor: "currentColor",
        borderTopColor: "transparent",
        opacity: 0.85
      }}
    />
  );
}

/** Shimmering placeholder block, sized by className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-white/[0.06] animate-pulse", className)} />;
}

/** A page's worth of skeletons — the standard "this admin page is loading" state. */
export function LoadingBlock({ rows = 3, stats = 0 }: { rows?: number; stats?: number }) {
  return (
    <div>
      {stats > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Determinate progress bar. `value` is 0-100; pass null for an indeterminate
 * state (we know it started, not how far along it is).
 */
export function ProgressBar({
  value,
  label,
  hint
}: {
  value: number | null;
  label?: string;
  hint?: string;
}) {
  const pct = value === null ? null : Math.min(100, Math.max(0, value));
  return (
    <div className="w-full">
      {(label || pct !== null) && (
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-white/60">{label}</span>
          {pct !== null && <span className="text-white/70 tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
        {pct === null ? (
          <div className="h-full w-1/3 rounded-full bg-white/50 animate-[indeterminate_1.2s_ease-in-out_infinite]" />
        ) : (
          <div
            className="h-full rounded-full bg-white/70 transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {hint && <p className="text-white/35 text-[11px] mt-1.5 tabular-nums">{hint}</p>}
    </div>
  );
}

/** Button label that swaps in a spinner while busy, keeping the width stable. */
export function BusyLabel({
  busy,
  children,
  busyText
}: {
  busy: boolean;
  children: ReactNode;
  busyText?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {busy && <Spinner size={13} />}
      {busy && busyText ? busyText : children}
    </span>
  );
}
