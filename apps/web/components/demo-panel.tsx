"use client";

import { useState } from "react";
import { simulateDeposit } from "@/lib/auth-client";

/**
 * Hidden demo control panel — only renders when NEXT_PUBLIC_DEMO_MODE=1.
 *
 * Lets the presenter simulate on-chain deposits off-camera during a recording
 * (the wallet service must run with WALLET_DEMO_MODE=1). Styled with inline CSS
 * so the app's light-theme Tailwind remaps never touch it, and pinned bottom-
 * left (opposite any product badges). Collapsible to a small dot.
 */

const ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

type Action = { label: string; symbol: string; chain: string; amount: number; note: string };

const ACTIONS: Action[] = [
  { label: "Simulate $1 USDT", symbol: "USDT", chain: "bsc", amount: 1, note: "BEP20 · activation" },
  { label: "Simulate $100 USDT", symbol: "USDT", chain: "tron", amount: 100, note: "TRC20 · top-up" }
];

export function DemoPanel() {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!ENABLED) return null;

  async function run(a: Action) {
    if (busy) return;
    setBusy(a.label);
    setMsg(null);
    try {
      await simulateDeposit(a.symbol, a.chain, a.amount);
      setMsg(`✓ +$${a.amount} ${a.symbol} credited — refreshing…`);
      setTimeout(() => window.location.reload(), 650);
    } catch (e) {
      setMsg((e as Error).message);
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Demo controls"
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 9999,
          width: 36,
          height: 36,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "#11131f",
          color: "#9aa0c0",
          cursor: "pointer",
          fontSize: 16
        }}
      >
        ⚙
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 9999,
        width: 240,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(17,19,31,0.96)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 18px 40px -18px rgba(0,0,0,0.7)",
        color: "#E7E9F5",
        fontFamily: "system-ui, sans-serif",
        padding: 12
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "#7a82a8" }}>
          ● Demo controls
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#7a82a8", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          title="Hide"
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => run(a)}
            disabled={!!busy}
            style={{
              textAlign: "left",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: busy === a.label ? "#2b2f4a" : "#1b1e30",
              color: "#E7E9F5",
              padding: "9px 11px",
              cursor: busy ? "default" : "pointer",
              opacity: busy && busy !== a.label ? 0.5 : 1
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {busy === a.label ? "Crediting…" : a.label}
            </div>
            <div style={{ fontSize: 11, color: "#8b92b8" }}>{a.note}</div>
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: msg.startsWith("✓") ? "#7fe0b0" : "#f0a0ad" }}>
          {msg}
        </div>
      )}
    </div>
  );
}
