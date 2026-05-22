"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <main className="min-h-screen bg-black text-white font-sans">
      <nav className="w-full px-6 py-6 border-b border-white/5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
            ← Admin
          </Link>
          <span className="text-white/40 text-xs tracking-[0.3em] uppercase">
            Settings
          </span>
        </div>
      </nav>

      <section className="max-w-4xl mx-auto px-6 py-12 space-y-14">
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
    </main>
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
  "flex-1 bg-[#141414] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-2 focus:ring-white/20";
const btnCls =
  "shrink-0 rounded-xl px-3 py-2 text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-40";

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
