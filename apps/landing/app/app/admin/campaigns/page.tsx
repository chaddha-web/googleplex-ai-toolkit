"use client";

/**
 * Admin → Email campaigns.
 *
 * Single-page surface: list of campaigns on the left, composer on the right.
 * Selecting a draft loads it into the composer; "New" clears it. Drafts can
 * be edited and deleted; sent campaigns are immutable (audit trail).
 *
 * Live preview is server-rendered (debounced 400 ms POST → /email/preview)
 * so the markdown→HTML logic lives in exactly one place — services/auth.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { email, type CampaignRow, type CampaignDetail, type EmailAudience } from "@/lib/auth-client";

type DraftState = {
  id: string | null;
  subject: string;
  body_md: string;
  audience: EmailAudience;
};

const EMPTY: DraftState = {
  id: null,
  subject: "",
  body_md:
    "Hi {{first_name}},\n\nWe're shipping new stuff this week.\n\n## What's new\n\n- Wallet deposits across ETH / BSC / Tron\n- AI Studio brand-kit generator\n- Community proposals + voting\n\nLog in: https://app.ggakingclub.com\n\n— The GoogolPlex team",
  audience: { requireOptIn: true, tiers: [], countries: [] }
};

const TIER_LABELS: Record<NonNullable<EmailAudience["tiers"]>[number], string> = {
  new: "New",
  activated: "Activated",
  built: "Built"
};

export default function CampaignsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<CampaignRow[] | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [audCount, setAudCount] = useState<{ total: number; effective: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<CampaignDetail | null>(null);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  async function loadList() {
    try {
      setList(await email.listCampaigns());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user?.role === "admin") loadList();
  }, [user]);

  // Debounced live preview + audience-count.
  const previewT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (previewT.current) clearTimeout(previewT.current);
    previewT.current = setTimeout(async () => {
      try {
        const r = await email.preview(draft.body_md, draft.subject);
        setPreviewHtml(r.html);
      } catch {
        /* leave previous preview */
      }
    }, 400);
    return () => {
      if (previewT.current) clearTimeout(previewT.current);
    };
  }, [draft.body_md, draft.subject]);

  useEffect(() => {
    if (audT.current) clearTimeout(audT.current);
    audT.current = setTimeout(async () => {
      try {
        setAudCount(await email.audienceCount(draft.audience));
      } catch {
        setAudCount(null);
      }
    }, 300);
    return () => {
      if (audT.current) clearTimeout(audT.current);
    };
  }, [draft.audience]);

  function newDraft() {
    setDraft(EMPTY);
    setSelected(null);
    setError(null);
  }

  async function openCampaign(id: string) {
    setBusy("Loading…");
    setError(null);
    try {
      const r = await email.getCampaign(id);
      setSelected(r.campaign);
      setDraft({
        id: r.campaign.id,
        subject: r.campaign.subject,
        body_md: r.campaign.body_md,
        audience: r.campaign.audience || {}
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    setBusy("Saving…");
    try {
      if (draft.id) {
        await email.updateCampaign(draft.id, {
          subject: draft.subject,
          body_md: draft.body_md,
          audience: draft.audience
        });
      } else {
        const r = await email.createCampaign({
          subject: draft.subject,
          body_md: draft.body_md,
          audience: draft.audience
        });
        setDraft((d) => ({ ...d, id: r.id }));
      }
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!draft.id) {
      setError("Save the draft first.");
      return;
    }
    const to = window.prompt("Send test to:", user?.email || "");
    if (!to) return;
    setError(null);
    setBusy("Sending test…");
    try {
      await email.sendTest(draft.id, to);
      alert("Test sent. Check the inbox.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendReal() {
    if (!draft.id) {
      setError("Save the draft first.");
      return;
    }
    const c = audCount;
    if (!c || c.effective === 0) {
      setError("No effective recipients.");
      return;
    }
    if (!window.confirm(`Send to ${c.effective} recipient(s)? This cannot be undone.`)) return;
    setError(null);
    setBusy("Sending…");
    try {
      await email.sendCampaign(draft.id);
      await loadList();
      alert(`Sending started for ${c.effective} recipients. Check Telegram + the list for progress.`);
      newDraft();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!draft.id) return;
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    try {
      await email.deleteCampaign(draft.id);
      newDraft();
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const sortedList = useMemo(() => list ?? [], [list]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
            ← Admin
          </Link>
          <h1 className="text-lg font-medium">Email campaigns</h1>
        </div>
        <button
          type="button"
          onClick={newDraft}
          className="rounded-full bg-white text-black text-sm font-medium px-4 py-2 hover:bg-white/90"
        >
          New campaign
        </button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-0 min-h-[calc(100vh-65px)]">
        {/* List */}
        <aside className="border-r border-white/10 p-4 overflow-y-auto">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">All campaigns</div>
          {!list ? (
            <div className="text-white/40 text-sm">Loading…</div>
          ) : sortedList.length === 0 ? (
            <div className="text-white/40 text-sm">No campaigns yet.</div>
          ) : (
            <ul className="space-y-1">
              {sortedList.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openCampaign(c.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 ${
                      draft.id === c.id ? "bg-white/10" : ""
                    }`}
                  >
                    <div className="text-sm truncate">{c.subject || "(no subject)"}</div>
                    <div className="text-[11px] text-white/40 mt-0.5 flex gap-2">
                      <StatusPill status={c.status} />
                      {c.sent_count > 0 && <span>· {c.sent_count} sent</span>}
                      {c.fail_count > 0 && <span className="text-red-400">· {c.fail_count} fail</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Composer */}
        <section className="border-r border-white/10 p-6 overflow-y-auto">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Composer</div>

          <label className="block text-xs text-white/50 mb-1">Subject</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Subject line — supports {{first_name}}"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-4 text-sm focus:outline-none focus:border-white/30"
          />

          <label className="block text-xs text-white/50 mb-1">
            Body (Markdown · merge tags: <code className="text-white/70">{"{{first_name}}"}</code>{" "}
            <code className="text-white/70">{"{{email}}"}</code>{" "}
            <code className="text-white/70">{"{{code11}}"}</code>)
          </label>
          <textarea
            value={draft.body_md}
            onChange={(e) => setDraft({ ...draft, body_md: e.target.value })}
            rows={20}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-white/30"
          />

          <AudienceEditor
            audience={draft.audience}
            onChange={(a) => setDraft({ ...draft, audience: a })}
            count={audCount}
          />

          {error && (
            <div className="mt-3 text-sm text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!!busy || !draft.subject || !draft.body_md}
              className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15 disabled:opacity-40"
            >
              {draft.id ? "Save draft" : "Create draft"}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={!!busy || !draft.id}
              className="rounded-full bg-white/10 text-white text-sm font-medium px-4 py-2 hover:bg-white/15 disabled:opacity-40"
            >
              Send test
            </button>
            <button
              type="button"
              onClick={sendReal}
              disabled={!!busy || !draft.id || !audCount || audCount.effective === 0}
              className="rounded-full bg-emerald-400 text-black text-sm font-medium px-4 py-2 hover:bg-emerald-300 disabled:opacity-40"
            >
              Send to {audCount?.effective ?? "…"}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={destroy}
                className="rounded-full bg-red-500/10 text-red-300 text-sm font-medium px-4 py-2 hover:bg-red-500/15 ml-auto"
              >
                Delete draft
              </button>
            )}
            {busy && <span className="text-white/40 text-sm self-center">{busy}</span>}
          </div>

          {selected && selected.status !== "draft" && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-white/60">
              This campaign is <StatusPill status={selected.status} /> and can no longer be edited or deleted.
              {selected.error && (
                <div className="mt-2 text-red-400">Error: {selected.error}</div>
              )}
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="p-6 overflow-y-auto bg-[#0a0a0a]">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Live preview</div>
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <iframe
              title="email-preview"
              srcDoc={previewHtml}
              className="w-full h-[calc(100vh-180px)] bg-[#0a0a0a]"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "sending"
      ? "bg-sky-500/15 text-sky-300"
      : status === "failed"
      ? "bg-red-500/15 text-red-300"
      : "bg-white/10 text-white/60";
  return (
    <span className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}

function AudienceEditor({
  audience,
  onChange,
  count
}: {
  audience: EmailAudience;
  onChange: (a: EmailAudience) => void;
  count: { total: number; effective: number } | null;
}) {
  const tiers = audience.tiers ?? [];
  const countries = audience.countries ?? [];
  function toggleTier(t: "new" | "activated" | "built") {
    const has = tiers.includes(t);
    onChange({ ...audience, tiers: has ? tiers.filter((x) => x !== t) : [...tiers, t] });
  }
  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-white/40">Audience</div>
        <div className="text-xs text-white/60">
          {count ? (
            <>
              <span className="text-white">{count.effective}</span> effective
              {count.effective !== count.total && (
                <span className="text-white/40"> (of {count.total}, after unsub filter)</span>
              )}
            </>
          ) : (
            "…"
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(["new", "activated", "built"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggleTier(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              tiers.includes(t)
                ? "bg-white text-black border-white"
                : "border-white/15 text-white/70 hover:border-white/30"
            }`}
          >
            {TIER_LABELS[t]}
          </button>
        ))}
        <span className="text-white/30 text-xs self-center ml-1">
          (none selected = all tiers)
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/80 mb-3">
        <input
          type="checkbox"
          checked={!!audience.requireOptIn}
          onChange={(e) => onChange({ ...audience, requireOptIn: e.target.checked })}
        />
        Only opted-in recipients (recommended)
      </label>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-white/50 mb-1">Signed up from</label>
          <input
            type="date"
            value={audience.from ? new Date(audience.from).toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              onChange({
                ...audience,
                from: e.target.value ? new Date(e.target.value + "T00:00:00Z").getTime() : null
              })
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/30"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">to</label>
          <input
            type="date"
            value={audience.to ? new Date(audience.to).toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              onChange({
                ...audience,
                to: e.target.value ? new Date(e.target.value + "T23:59:59Z").getTime() : null
              })
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <label className="block text-xs text-white/50 mb-1">
        Countries (comma-separated, exact match — leave blank for all)
      </label>
      <input
        type="text"
        value={countries.join(", ")}
        onChange={(e) =>
          onChange({
            ...audience,
            countries: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          })
        }
        placeholder="United States, India, Germany"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/30"
      />
    </div>
  );
}
