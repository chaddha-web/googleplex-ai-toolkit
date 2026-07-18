"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import {
  getAdminSettings,
  setAdminSetting,
  promoteAdmin,
  type SecretField
} from "@/lib/auth-client";

type Settings = Record<string, string | SecretField>;

const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic", modelHint: "claude-haiku-4-5" },
  { id: "openai", label: "OpenAI", modelHint: "gpt-4o-mini" },
  { id: "gemini", label: "Google Gemini", modelHint: "gemini-1.5-flash" }
] as const;

const CHAINS = [
  { id: "eth", label: "Ethereum (ETH)" },
  { id: "bsc", label: "BNB Smart Chain (BNB)" },
  { id: "tron", label: "Tron (TRX)" },
  { id: "btc", label: "Bitcoin (BTC)" }
] as const;

// Withdrawable (chain, token) pairs — mirrors the wallet token registry.
const WD_ASSETS: { chain: string; symbol: string }[] = [
  { chain: "eth", symbol: "ETH" },
  { chain: "eth", symbol: "USDT" },
  { chain: "eth", symbol: "USDC" },
  { chain: "bsc", symbol: "BNB" },
  { chain: "bsc", symbol: "USDT" },
  { chain: "bsc", symbol: "USDC" },
  { chain: "tron", symbol: "TRX" },
  { chain: "tron", symbol: "USDT" },
  { chain: "tron", symbol: "PARTY" },
  { chain: "btc", symbol: "BTC" }
];

const FIN_CHAINS = [
  { id: "eth", label: "Ethereum" },
  { id: "bsc", label: "BNB Chain" },
  { id: "tron", label: "Tron" },
  { id: "btc", label: "Bitcoin" }
] as const;

export default function AdminSettings() {
  const { user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    getAdminSettings()
      .then((r) => {
        setSettings(r.settings);
        setIsFounder(r.isFounder);
      })
      .catch((e) => setError((e as Error).message));
  }, [user]);

  if (!user || user.role !== "admin") return null;

  return (
    <section className="max-w-4xl mx-auto space-y-14">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
            Platform <em className="font-serif-i text-white/60">settings</em>
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Secrets are encrypted at rest and shown masked. Enter a new value to
            overwrite; leave blank and save to clear.
          </p>
          {error && <p className="text-rose-300/90 text-sm mt-3">{error}</p>}
        </div>

        {settings === null && !error ? (
          <p className="text-white/40 text-sm">Loading…</p>
        ) : settings ? (
          <>
            {/* ── AI providers ──────────────────────────────────── */}
            <Section title="AI assistant" subtitle="Keys, models, and provider order">
              <Row label="Active provider">
                <SelectSetting
                  k="ai.active_provider"
                  options={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                  initial={(settings["ai.active_provider"] as string) || "anthropic"}
                />
              </Row>
              <Row label="Fallback order">
                <TextSetting
                  k="ai.fallback_order"
                  placeholder="anthropic,openai,gemini"
                  initial={(settings["ai.fallback_order"] as string) || ""}
                />
              </Row>
              {AI_PROVIDERS.map((p) => (
                <div key={p.id} className="pt-3 border-t border-white/5">
                  <p className="text-white/70 text-sm font-medium mb-2">{p.label}</p>
                  <Row label="API key">
                    <SecretSetting
                      k={`ai.key.${p.id}`}
                      field={settings[`ai.key.${p.id}`] as SecretField}
                    />
                  </Row>
                  <Row label="Model">
                    <TextSetting
                      k={`ai.model.${p.id}`}
                      placeholder={p.modelHint}
                      initial={(settings[`ai.model.${p.id}`] as string) || ""}
                    />
                  </Row>
                </div>
              ))}
            </Section>

            {/* ── Chain wallets ─────────────────────────────────── */}
            <Section
              title="Withdrawal wallets"
              subtitle="Funded company wallet per chain — withdrawals send from these"
            >
              {CHAINS.map((c) => (
                <div key={c.id} className="pt-3 border-t border-white/5">
                  <p className="text-white/70 text-sm font-medium mb-2">{c.label}</p>
                  <Row label="Address">
                    <TextSetting
                      k={`wallet.${c.id}.address`}
                      placeholder="Public address"
                      initial={(settings[`wallet.${c.id}.address`] as string) || ""}
                    />
                  </Row>
                  <Row label="Private key">
                    <SecretSetting
                      k={`wallet.${c.id}.privkey`}
                      field={settings[`wallet.${c.id}.privkey`] as SecretField}
                    />
                  </Row>
                </div>
              ))}
            </Section>

            {/* ── Withdrawal rules / auto-flush / sale wallets ───── */}
            <RulesEditor settings={settings} isFounder={isFounder} />
            <ThresholdsEditor settings={settings} />
            <SaleWalletsEditor settings={settings} isFounder={isFounder} />

            {/* ── Community ─────────────────────────────────────── */}
            <Section
              title="Community"
              subtitle="Governance voting requirements"
            >
              <Row label="Min PARTY to vote">
                <TextSetting
                  k="community.vote_min_party"
                  placeholder="e.g. 1000000"
                  initial={(settings["community.vote_min_party"] as string) || ""}
                />
              </Row>
            </Section>

            {/* ── Withdrawal limits ─────────────────────────────── */}
            <Section
              title="Withdrawal limits"
              subtitle="USD caps + anti-takeover cooldowns (blank = built-in default)"
            >
              <Row label="Per-transaction cap ($)">
                <TextSetting
                  k="wd.max_per_tx_usd"
                  placeholder="1000"
                  initial={(settings["wd.max_per_tx_usd"] as string) || ""}
                />
              </Row>
              <Row label="24h daily cap ($)">
                <TextSetting
                  k="wd.daily_usd"
                  placeholder="5000"
                  initial={(settings["wd.daily_usd"] as string) || ""}
                />
              </Row>
              <Row label="Review threshold ($)">
                <TextSetting
                  k="wd.review_threshold_usd"
                  placeholder="500"
                  initial={(settings["wd.review_threshold_usd"] as string) || ""}
                />
              </Row>
              <Row label="Signup cooldown (hours)">
                <TextSetting
                  k="wd.signup_cooldown_hours"
                  placeholder="24"
                  initial={(settings["wd.signup_cooldown_hours"] as string) || ""}
                />
              </Row>
              <Row label="Password-change cooldown (hours)">
                <TextSetting
                  k="wd.pwchange_cooldown_hours"
                  placeholder="24"
                  initial={(settings["wd.pwchange_cooldown_hours"] as string) || ""}
                />
              </Row>
            </Section>

            {/* ── Promote admin (founder only) ──────────────────── */}
            {isFounder && <PromoteAdmin />}
            {!isFounder && (
              <p className="text-white/30 text-xs">
                Admin promotion is restricted to the founder account.
              </p>
            )}
          </>
        ) : null}
    </section>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="liquid-glass rounded-3xl p-6 md:p-8">
      <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
      <p className="text-white/40 text-xs mt-1 mb-5">{subtitle}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] sm:items-center gap-2">
      <label className="text-white/50 text-xs">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "flex-1 bg-[#141414] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-[#8A68FF]/60";
const btnCls =
  "shrink-0 rounded-xl px-3 py-2 text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[#8A68FF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";
const inputSm =
  "bg-[#141414] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-[#8A68FF]/60";

function useSave(k: string) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(value: string) {
    setBusy(true);
    setErr(null);
    setDone(false);
    try {
      await setAdminSetting(k, value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, done, err, save };
}

function TextSetting({
  k,
  initial,
  placeholder
}: {
  k: string;
  initial: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(initial);
  const { busy, done, err, save } = useSave(k);
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
        <button onClick={() => save(v)} disabled={busy} className={btnCls}>
          {busy ? "…" : done ? "✓" : "Save"}
        </button>
      </div>
      {err && <p className="text-rose-300/90 text-xs mt-1">{err}</p>}
    </div>
  );
}

function SecretSetting({ k, field }: { k: string; field?: SecretField }) {
  const [v, setV] = useState("");
  const { busy, done, err, save } = useSave(k);
  const isSet = field?.set;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={isSet ? `Set (${field?.masked}) — enter to replace` : "Not set"}
          className={inputCls}
          autoComplete="new-password"
        />
        <button onClick={() => save(v)} disabled={busy || !v} className={btnCls}>
          {busy ? "…" : done ? "✓" : "Save"}
        </button>
      </div>
      {err && <p className="text-rose-300/90 text-xs mt-1">{err}</p>}
    </div>
  );
}

function SelectSetting({
  k,
  options,
  initial
}: {
  k: string;
  options: { value: string; label: string }[];
  initial: string;
}) {
  const [v, setV] = useState(initial);
  const { busy, done, err, save } = useSave(k);
  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={v}
          onChange={(e) => setV(e.target.value)}
          className={`${inputCls} appearance-none`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button onClick={() => save(v)} disabled={busy} className={btnCls}>
          {busy ? "…" : done ? "✓" : "Save"}
        </button>
      </div>
      {err && <p className="text-rose-300/90 text-xs mt-1">{err}</p>}
    </div>
  );
}

function PromoteAdmin() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const email = await promoteAdmin(code.trim());
      setMsg(`Promoted ${email} to admin.`);
      setCode("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Create admin" subtitle="Promote a member to admin by their Member ID">
      <Row label="Member ID">
        <div>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. KSY75PVH2AN"
              className={`${inputCls} font-mono tracking-widest`}
            />
            <button onClick={go} disabled={busy || !code.trim()} className={btnCls}>
              {busy ? "…" : "Promote"}
            </button>
          </div>
          {msg && <p className="text-emerald-300/90 text-xs mt-1">{msg}</p>}
          {err && <p className="text-rose-300/90 text-xs mt-1">{err}</p>}
        </div>
      </Row>
    </Section>
  );
}

function parseJsonObj(v: unknown): Record<string, unknown> {
  try {
    const o = JSON.parse((v as string) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function numObj(rec: Record<string, string>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const t = v.trim();
    if (t === "") continue;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) o[k] = n;
  }
  return o;
}

// ── Withdrawal rules: per-asset minimum + flat fee ───────────────────────────
function RulesEditor({ settings, isFounder }: { settings: Settings; isFounder: boolean }) {
  const seed = (src: Record<string, unknown>) =>
    Object.fromEntries(
      WD_ASSETS.map((a) => {
        const k = `${a.chain}:${a.symbol}`;
        const v = src[k];
        return [k, typeof v === "number" ? String(v) : ""];
      })
    );
  const [mins, setMins] = useState<Record<string, string>>(() => seed(parseJsonObj(settings["wd.minimums"])));
  const [fees, setFees] = useState<Record<string, string>>(() => seed(parseJsonObj(settings["wd.fees"])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await setAdminSetting("wd.minimums", JSON.stringify(numObj(mins)));
      if (isFounder) await setAdminSetting("wd.fees", JSON.stringify(numObj(fees)));
      setMsg("Saved. Blank = no minimum / no fee.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Withdrawal rules"
      subtitle="Per-asset minimum and flat fee (deducted from the payout, kept in treasury). Blank = none."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-white/40 border-b border-white/10">
              <th className="px-1 py-2 font-medium">Asset</th>
              <th className="px-1 py-2 font-medium">Min (token)</th>
              <th className="px-1 py-2 font-medium">Fee (token){isFounder ? "" : " · founder"}</th>
            </tr>
          </thead>
          <tbody>
            {WD_ASSETS.map((a) => {
              const k = `${a.chain}:${a.symbol}`;
              return (
                <tr key={k} className="border-b border-white/5">
                  <td className="px-1 py-2 text-white/80 whitespace-nowrap">
                    {a.symbol} <span className="text-white/40 text-xs">· {a.chain.toUpperCase()}</span>
                  </td>
                  <td className="px-1 py-2">
                    <input
                      value={mins[k]}
                      onChange={(e) => setMins({ ...mins, [k]: e.target.value })}
                      placeholder="0"
                      inputMode="decimal"
                      className={`${inputSm} w-28`}
                    />
                  </td>
                  <td className="px-1 py-2">
                    <input
                      value={fees[k]}
                      onChange={(e) => setFees({ ...fees, [k]: e.target.value })}
                      placeholder="0"
                      inputMode="decimal"
                      disabled={!isFounder}
                      className={`${inputSm} w-28 ${isFounder ? "" : "opacity-40"}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className={btnCls}>
          {busy ? "…" : "Save rules"}
        </button>
        {msg && <span className="text-emerald-300 text-xs">{msg}</span>}
        {err && <span className="text-rose-300/90 text-xs">{err}</span>}
      </div>
      {!isFounder && <p className="text-white/30 text-xs mt-2">Fees are founder-only; you can set minimums.</p>}
    </Section>
  );
}

// ── Auto-flush thresholds (per chain, USD) ───────────────────────────────────
function ThresholdsEditor({ settings }: { settings: Settings }) {
  const init = parseJsonObj(settings["flush.thresholds"]);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIN_CHAINS.map((c) => [c.id, typeof init[c.id] === "number" ? String(init[c.id]) : ""]))
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await setAdminSetting("flush.thresholds", JSON.stringify(numObj(vals)));
      setMsg("Saved. Blank / 0 = auto-flush off for that chain.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Auto-flush"
      subtitle="When a member's on-chain balance on a chain crosses this USD amount, it's swept to treasury automatically. Blank / 0 = off."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FIN_CHAINS.map((c) => (
          <label key={c.id} className="block">
            <span className="text-white/50 text-xs">{c.label} ($)</span>
            <input
              value={vals[c.id]}
              onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })}
              placeholder="off"
              inputMode="decimal"
              className={`${inputSm} w-full mt-1`}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className={btnCls}>
          {busy ? "…" : "Save thresholds"}
        </button>
        {msg && <span className="text-emerald-300 text-xs">{msg}</span>}
        {err && <span className="text-rose-300/90 text-xs">{err}</span>}
      </div>
    </Section>
  );
}

// ── Sale wallets (receive addresses; founder-only, type-to-confirm) ──────────
function SaleWalletsEditor({ settings, isFounder }: { settings: Settings; isFounder: boolean }) {
  const init = parseJsonObj(settings["sale.wallets"]);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIN_CHAINS.map((c) => [c.id, typeof init[c.id] === "string" ? (init[c.id] as string) : ""]))
  );
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const o: Record<string, string> = {};
    for (const c of FIN_CHAINS) {
      const t = (vals[c.id] ?? "").trim();
      if (t !== "") o[c.id] = t;
    }
    try {
      await setAdminSetting("sale.wallets", JSON.stringify(o));
      setMsg("Saved.");
      setConfirm("");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isFounder) {
    return (
      <Section title="Sale wallets" subtitle="Receive addresses for studio + product purchases.">
        <p className="text-white/40 text-sm">Only the main admin can set the sale wallets.</p>
      </Section>
    );
  }

  return (
    <Section
      title="Sale wallets"
      subtitle="Where studio + product purchases are received, per chain. Founder-only."
    >
      <div className="space-y-3">
        {FIN_CHAINS.map((c) => (
          <Row key={c.id} label={c.label}>
            <input
              value={vals[c.id]}
              onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })}
              placeholder={`${c.label} receive address`}
              className={`${inputCls} font-mono text-xs`}
            />
          </Row>
        ))}
      </div>
      <div className="mt-4">
        <p className="text-white/40 text-xs mb-1.5">
          This changes where purchase funds are received. Type{" "}
          <span className="font-mono text-white/70">CONFIRM</span> to save.
        </p>
        <div className="flex items-center gap-3">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="CONFIRM"
            className={`${inputSm} w-32`}
          />
          <button type="button" onClick={save} disabled={busy || confirm.trim() !== "CONFIRM"} className={btnCls}>
            {busy ? "…" : "Save sale wallets"}
          </button>
          {msg && <span className="text-emerald-300 text-xs">{msg}</span>}
          {err && <span className="text-rose-300/90 text-xs">{err}</span>}
        </div>
      </div>
    </Section>
  );
}
