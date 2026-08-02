"use client";

/**
 * Admin → Orientation. The instructional video and quiz every new member sees
 * once, right after their $1 activation deposit clears.
 *
 * Three things live here: the video (uploaded or linked), the gating rules,
 * and the question bank. The member-facing page is /app/setup/orientation.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  StatCard,
  ConfirmDialog,
  Spinner,
  LoadingBlock,
  ProgressBar,
  BusyLabel
} from "@/components/admin/ui";
import {
  adminCreateQuestion,
  adminDeleteQuestion,
  adminOnboarding,
  adminOnboardingResponses,
  adminReorderQuestions,
  adminResetOnboarding,
  adminSetOnboardingConfig,
  adminUpdateQuestion,
  adminUploadMediaWithProgress,
  type AdminOnboarding,
  type AdminQuestion,
  type Gating,
  type MemberResponse,
  type UploadProgress
} from "@/lib/auth-client";

const GATING_COPY: Record<Gating, { label: string; hint: string }> = {
  off: {
    label: "Off",
    hint: "No orientation. Members go straight from activation to the dashboard."
  },
  answer: {
    label: "Must answer",
    hint: "Every required question must be answered. Any score gets through — answers are still recorded."
  },
  pass: {
    label: "Must pass",
    hint: "Must also score at or above the pass mark. Below it, they retry."
  }
};

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

/** "12.4 MB of 300 MB · 2.1 MB/s · about 2m 18s left" */
function progressHint(p: UploadProgress): string {
  const rate = p.bps > 0 ? ` · ${mb(p.bps)}/s` : "";
  let eta = "";
  if (p.etaSeconds !== null && p.etaSeconds > 1) {
    const s = Math.round(p.etaSeconds);
    eta = s >= 60 ? ` · about ${Math.floor(s / 60)}m ${s % 60}s left` : ` · about ${s}s left`;
  }
  return `${mb(p.loaded)} of ${mb(p.total)}${rate}${eta}`;
}

function when(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export default function OrientationAdminPage() {
  const [data, setData] = useState<AdminOnboarding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminOnboarding());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = data?.questions ?? [];
  const activeCount = questions.filter((q) => q.active).length;
  const gradedCount = questions.filter((q) => q.active && q.correctIndex !== null).length;
  const completions = data?.completions ?? [];
  const passedCount = completions.filter((c) => c.onboarding_completed_at).length;

  return (
    <section className="max-w-6xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Members</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Orientation <em className="font-serif-i text-white/60">&amp; quiz</em>.
      </h1>
      <p className="text-white/50 text-sm mt-3 max-w-2xl">
        Shown once, after the $1 activation deposit clears and tokens are issued. Members see it at{" "}
        <code className="text-white/70">/app/setup/orientation</code>.
      </p>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}
      {note && <p className="mt-6 text-emerald-300/90 text-sm">{note}</p>}

      {!data && !error && (
        <div className="mt-8">
          <LoadingBlock stats={4} rows={3} />
        </div>
      )}

      {data && (
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Gating"
          value={data ? GATING_COPY[data.config.gating].label : "…"}
          tone={data?.config.gating === "off" ? undefined : "emerald"}
          hint={data?.config.gating === "pass" ? `${data.config.passMark}% to pass` : "no score needed"}
        />
        <StatCard label="Questions" value={String(activeCount)} hint={`${gradedCount} graded`} />
        <StatCard
          label="Video"
          value={data?.config.video ? (data.config.video.kind === "upload" ? "Uploaded" : "Linked") : "None"}
          hint={data?.config.video?.title || "not set"}
        />
        <StatCard
          label="Completed"
          value={String(passedCount)}
          tone="emerald"
          hint={`${completions.length} attempted`}
        />
      </div>
      )}

      {data && (
        <>
          <VideoPanel
            config={data.config}
            onSaved={(msg) => {
              setNote(msg);
              setError(null);
              void load();
            }}
            onError={(msg) => {
              setError(msg);
              setNote(null);
            }}
          />
          <GatingPanel
            config={data.config}
            onSaved={(msg) => {
              setNote(msg);
              setError(null);
              void load();
            }}
            onError={(msg) => {
              setError(msg);
              setNote(null);
            }}
          />
          <QuestionsPanel
            questions={questions}
            reload={load}
            onError={(msg) => {
              setError(msg);
              setNote(null);
            }}
          />
          <CompletionsPanel completions={completions} reload={load} />
        </>
      )}
    </section>
  );
}

// ── Video ───────────────────────────────────────────────────────────────────

function VideoPanel({
  config,
  onSaved,
  onError
}: {
  config: AdminOnboarding["config"];
  onSaved: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [mode, setMode] = useState<"upload" | "url">(config.video?.kind ?? "upload");
  const [link, setLink] = useState(config.video?.kind === "url" ? config.video.src : "");
  const [title, setTitle] = useState(config.video?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  /** Set once the bytes are out and the server is still finishing the write. */
  const [finishing, setFinishing] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveLink() {
    setBusy(true);
    try {
      await adminSetOnboardingConfig({ video: { kind: "url", src: link.trim(), title } });
      onSaved("Video link saved.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setFinishing(false);
    setProgress({ percent: 0, loaded: 0, total: file.size, bps: 0, etaSeconds: null });
    const job = adminUploadMediaWithProgress(file, (p) => {
      setProgress(p);
      if (p.percent !== null && p.percent >= 100) setFinishing(true);
    });
    abortRef.current = job.abort;
    try {
      const up = await job.promise;
      await adminSetOnboardingConfig({ video: { kind: "upload", src: up.name, title } });
      onSaved(`Video uploaded (${mb(up.size)}) and set as the orientation video.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
      setFinishing(false);
      abortRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await adminSetOnboardingConfig({ video: null });
      onSaved("Video removed. Members will go straight to the questions.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="liquid-glass rounded-2xl p-6 mt-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl tracking-tight">The video</h2>
          <p className="text-white/40 text-xs mt-1">
            Upload an MP4/WebM, or paste a YouTube, Vimeo or direct link. Aim for 5–10 minutes.
          </p>
        </div>
        {config.video && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-rose-300/80 hover:text-rose-200 text-xs underline disabled:opacity-50"
          >
            Remove video
          </button>
        )}
      </div>

      {config.video && (
        <div className="mt-5 rounded-xl overflow-hidden ring-1 ring-white/10 max-w-xl">
          <div className="relative w-full aspect-video bg-black">
            {/youtube|vimeo/i.test(config.video.url) ? (
              <iframe src={config.video.url.replace("watch?v=", "embed/")} className="absolute inset-0 w-full h-full" allowFullScreen />
            ) : (
              <video src={config.video.url} controls className="absolute inset-0 w-full h-full" />
            )}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 max-w-xl">
        <label className="block">
          <span className="text-white/50 text-xs">Title shown above the player (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Welcome to GoogolPlex"
            className="mt-1 w-full rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30"
          />
        </label>

        <div className="flex gap-2">
          {(["upload", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-xs transition-colors ring-1 ${
                mode === m ? "bg-white/10 ring-white/40 text-white" : "ring-white/10 text-white/50 hover:text-white/80"
              }`}
            >
              {m === "upload" ? "Upload a file" : "Paste a link"}
            </button>
          ))}
        </div>

        {mode === "upload" ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
              className="block w-full text-sm text-white/60 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-5 file:py-2 file:text-sm file:text-black hover:file:opacity-90 disabled:opacity-50"
            />

            {progress ? (
              <div className="mt-4">
                <ProgressBar
                  value={finishing ? null : progress.percent}
                  label={finishing ? "Saving on the server…" : "Uploading"}
                  hint={finishing ? "Bytes are up — writing the file." : progressHint(progress)}
                />
                <button
                  type="button"
                  onClick={() => abortRef.current?.()}
                  className="mt-2 text-white/40 hover:text-rose-300 text-xs underline transition-colors"
                >
                  Cancel upload
                </button>
              </div>
            ) : (
              <p className="text-white/30 text-[11px] mt-2">
                Large files take a while — keep this tab open until it finishes.
              </p>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className="flex-1 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30"
            />
            <button
              type="button"
              onClick={saveLink}
              disabled={busy || !link.trim()}
              className="rounded-full bg-white text-black px-5 py-2 text-sm font-medium disabled:opacity-40"
            >
              <BusyLabel busy={busy} busyText="Saving…">
                Save
              </BusyLabel>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gating ──────────────────────────────────────────────────────────────────

function GatingPanel({
  config,
  onSaved,
  onError
}: {
  config: AdminOnboarding["config"];
  onSaved: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [gating, setGating] = useState<Gating>(config.gating);
  const [passMark, setPassMark] = useState(String(config.passMark));
  const [maxAttempts, setMaxAttempts] = useState(String(config.maxAttempts));
  const [busy, setBusy] = useState(false);

  const dirty =
    gating !== config.gating ||
    Number(passMark) !== config.passMark ||
    Number(maxAttempts) !== config.maxAttempts;

  async function save() {
    setBusy(true);
    try {
      await adminSetOnboardingConfig({
        gating,
        passMark: Number(passMark),
        maxAttempts: Number(maxAttempts)
      });
      onSaved("Orientation rules saved.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="liquid-glass rounded-2xl p-6 mt-4">
      <h2 className="font-serif text-2xl tracking-tight">The rules</h2>
      <p className="text-white/40 text-xs mt-1">How hard a gate this is between activation and the dashboard.</p>

      <div className="mt-5 grid gap-2 max-w-2xl">
        {(Object.keys(GATING_COPY) as Gating[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGating(g)}
            className={`text-left rounded-xl px-4 py-3 ring-1 transition-colors ${
              gating === g ? "bg-white/10 ring-white/40" : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.05]"
            }`}
          >
            <span className="text-white text-sm">{GATING_COPY[g].label}</span>
            <span className="block text-white/40 text-xs mt-0.5">{GATING_COPY[g].hint}</span>
          </button>
        ))}
      </div>

      {gating === "pass" && (
        <div className="mt-5 flex flex-wrap gap-4 max-w-2xl">
          <label className="block">
            <span className="text-white/50 text-xs">Pass mark (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={passMark}
              onChange={(e) => setPassMark(e.target.value)}
              className="mt-1 w-32 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white outline-none focus:ring-white/30"
            />
          </label>
          <label className="block">
            <span className="text-white/50 text-xs">Max attempts (0 = unlimited)</span>
            <input
              type="number"
              min={0}
              max={50}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              className="mt-1 w-44 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white outline-none focus:ring-white/30"
            />
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || !dirty}
        className="mt-6 rounded-full bg-white text-black px-6 py-2 text-sm font-medium disabled:opacity-40"
      >
        <BusyLabel busy={busy} busyText="Saving…">
          Save rules
        </BusyLabel>
      </button>
    </div>
  );
}

// ── Questions ───────────────────────────────────────────────────────────────

const BLANK = { prompt: "", options: ["", ""], correctIndex: 0 as number | null, required: true };

function QuestionsPanel({
  questions,
  reload,
  onError
}: {
  questions: AdminQuestion[];
  reload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [draft, setDraft] = useState({ ...BLANK, options: ["", ""] });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    try {
      await adminCreateQuestion({
        prompt: draft.prompt,
        options: draft.options.filter((o) => o.trim()),
        correctIndex: draft.correctIndex,
        required: draft.required
      });
      setDraft({ ...BLANK, options: ["", ""] });
      setAdding(false);
      await reload();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await adminReorderQuestions(ids);
      await reload();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="liquid-glass rounded-2xl p-6 mt-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl tracking-tight">The questions</h2>
          <p className="text-white/40 text-xs mt-1">
            10–15 works well. Mark a question optional to ask without gating on it, and leave the answer
            key blank for a survey-style question that isn&apos;t scored.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-white text-black px-5 py-2 text-sm font-medium"
        >
          {adding ? "Cancel" : "Add question"}
        </button>
      </div>

      {adding && (
        <QuestionEditor
          value={draft}
          onChange={setDraft}
          busy={busy}
          onSubmit={add}
          submitLabel="Add question"
        />
      )}

      <div className="mt-6 space-y-3">
        {questions.length === 0 && (
          <p className="text-white/40 text-sm">No questions yet. Members will only see the video.</p>
        )}
        {questions.map((q, i) => (
          <QuestionRow
            key={q.id}
            q={q}
            index={i + 1}
            first={i === 0}
            last={i === questions.length - 1}
            onMove={move}
            onDelete={() => setConfirmId(q.id)}
            reload={reload}
            onError={onError}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this question?"
        body="Members' past answers to it are kept — they're the record of what was actually asked."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setConfirmId(null)}
        onConfirm={async () => {
          const id = confirmId;
          setConfirmId(null);
          if (!id) return;
          try {
            await adminDeleteQuestion(id);
            await reload();
          } catch (e) {
            onError((e as Error).message);
          }
        }}
      />
    </div>
  );
}

type Draft = { prompt: string; options: string[]; correctIndex: number | null; required: boolean };

function QuestionEditor({
  value,
  onChange,
  busy,
  onSubmit,
  submitLabel
}: {
  value: Draft;
  onChange: (d: Draft) => void;
  busy: boolean;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  const valid = value.prompt.trim().length >= 3 && value.options.filter((o) => o.trim()).length >= 2;

  return (
    <div className="mt-5 rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-5">
      <label className="block">
        <span className="text-white/50 text-xs">Question</span>
        <textarea
          value={value.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          rows={2}
          placeholder="What backs the tokens issued to you at signup?"
          className="mt-1 w-full rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30 resize-y"
        />
      </label>

      <p className="text-white/50 text-xs mt-4 mb-2">
        Options — click the circle to mark the correct answer
      </p>
      <div className="space-y-2">
        {value.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => set({ correctIndex: value.correctIndex === i ? null : i })}
              title={value.correctIndex === i ? "Correct answer" : "Mark as the correct answer"}
              className={`shrink-0 w-5 h-5 rounded-full ring-1 transition-colors ${
                value.correctIndex === i ? "bg-emerald-400 ring-emerald-300" : "ring-white/25 hover:ring-white/50"
              }`}
            />
            <input
              value={opt}
              onChange={(e) => {
                const next = [...value.options];
                next[i] = e.target.value;
                set({ options: next });
              }}
              placeholder={`Option ${i + 1}`}
              className="flex-1 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30"
            />
            {value.options.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  const next = value.options.filter((_, k) => k !== i);
                  const ci =
                    value.correctIndex === null
                      ? null
                      : value.correctIndex === i
                        ? null
                        : value.correctIndex > i
                          ? value.correctIndex - 1
                          : value.correctIndex;
                  set({ options: next, correctIndex: ci });
                }}
                className="text-white/30 hover:text-rose-300 text-lg leading-none px-1"
                title="Remove option"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {value.options.length < 8 && (
          <button
            type="button"
            onClick={() => set({ options: [...value.options, ""] })}
            className="text-white/50 hover:text-white text-xs underline"
          >
            Add option
          </button>
        )}
        <label className="flex items-center gap-2 text-white/60 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={value.required}
            onChange={(e) => set({ required: e.target.checked })}
            className="accent-white"
          />
          Required — members can&apos;t submit without answering
        </label>
        {value.correctIndex === null && (
          <span className="text-amber-200/70 text-xs">Not scored (no correct answer set)</span>
        )}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !valid}
        className="mt-5 rounded-full bg-white text-black px-6 py-2 text-sm font-medium disabled:opacity-40"
      >
        <BusyLabel busy={busy} busyText="Saving…">
          {submitLabel}
        </BusyLabel>
      </button>
    </div>
  );
}

function QuestionRow({
  q,
  index,
  first,
  last,
  onMove,
  onDelete,
  reload,
  onError
}: {
  q: AdminQuestion;
  index: number;
  first: boolean;
  last: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: () => void;
  reload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    required: q.required
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await adminUpdateQuestion(q.id, {
        prompt: draft.prompt,
        options: draft.options.filter((o) => o.trim()),
        correctIndex: draft.correctIndex,
        required: draft.required
      });
      setEditing(false);
      await reload();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    try {
      await adminUpdateQuestion(q.id, { active: !q.active });
      await reload();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className={`rounded-xl ring-1 p-4 ${q.active ? "bg-white/[0.02] ring-white/10" : "bg-white/[0.01] ring-white/5 opacity-60"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-white text-sm">
            <span className="text-white/30 mr-2">{index}.</span>
            {q.prompt}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${q.required ? "bg-white/10 text-white/60" : "bg-white/[0.04] text-white/35"}`}>
              {q.required ? "Required" : "Optional"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${q.correctIndex === null ? "bg-amber-400/10 text-amber-200/70" : "bg-emerald-400/10 text-emerald-200/70"}`}>
              {q.correctIndex === null ? "Not scored" : `Answer: ${q.options[q.correctIndex] ?? "—"}`}
            </span>
            {!q.active && (
              <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide bg-white/[0.04] text-white/35">
                Hidden
              </span>
            )}
            <span className="text-white/25 text-[11px]">{q.options.length} options</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onMove(q.id, -1)} disabled={first} className="text-white/30 hover:text-white disabled:opacity-20 px-1.5" title="Move up">
            ↑
          </button>
          <button type="button" onClick={() => onMove(q.id, 1)} disabled={last} className="text-white/30 hover:text-white disabled:opacity-20 px-1.5" title="Move down">
            ↓
          </button>
          <button type="button" onClick={toggleActive} className="text-white/40 hover:text-white text-xs underline px-2" title={q.active ? "Hide from members" : "Show to members"}>
            {q.active ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-white/40 hover:text-white text-xs underline px-2">
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" onClick={onDelete} className="text-rose-300/60 hover:text-rose-200 text-xs underline px-2">
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <QuestionEditor value={draft} onChange={setDraft} busy={busy} onSubmit={save} submitLabel="Save changes" />
      )}
    </div>
  );
}

// ── Completions ─────────────────────────────────────────────────────────────

function CompletionsPanel({
  completions,
  reload
}: {
  completions: AdminOnboarding["completions"];
  reload: () => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [responses, setResponses] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  async function open(userId: string) {
    if (openId === userId) {
      setOpenId(null);
      return;
    }
    setOpenId(userId);
    setLoading(true);
    try {
      const r = await adminOnboardingResponses(userId);
      setResponses(r.responses);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="liquid-glass rounded-2xl p-6 mt-4">
      <h2 className="font-serif text-2xl tracking-tight">Who&apos;s been through it</h2>
      {completions.length === 0 ? (
        <p className="text-white/40 text-sm mt-3">Nobody has attempted the orientation yet.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-white/35 text-[11px] uppercase tracking-wider text-left">
                <th className="pb-3 font-normal">Member</th>
                <th className="pb-3 font-normal">Score</th>
                <th className="pb-3 font-normal">Attempts</th>
                <th className="pb-3 font-normal">Completed</th>
                <th className="pb-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-white/5">
                    <td className="py-3 pr-4">
                      <span className="text-white">
                        {c.first_name} {c.last_name}
                      </span>
                      <span className="block text-white/35 text-xs">{c.email}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {c.onboarding_score === null ? (
                        <span className="text-white/30">—</span>
                      ) : (
                        <span className={c.onboarding_completed_at ? "text-emerald-300" : "text-amber-300"}>
                          {c.onboarding_score}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-white/60">{c.onboarding_attempts}</td>
                    <td className="py-3 pr-4 text-white/50 text-xs">{when(c.onboarding_completed_at)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => open(c.id)} className="text-white/40 hover:text-white text-xs underline px-2">
                        {openId === c.id ? "Hide" : "Answers"}
                      </button>
                      <button
                        type="button"
                        disabled={resettingId === c.id}
                        onClick={async () => {
                          setResettingId(c.id);
                          try {
                            await adminResetOnboarding(c.id);
                            await reload();
                          } finally {
                            setResettingId(null);
                          }
                        }}
                        className="text-white/40 hover:text-white text-xs underline px-2 disabled:opacity-40"
                        title="Clear their attempts so they sit it again"
                      >
                        {resettingId === c.id ? <Spinner size={11} /> : "Reset"}
                      </button>
                    </td>
                  </tr>
                  {openId === c.id && (
                    <tr>
                      <td colSpan={5} className="pb-4">
                        {loading ? (
                          <p className="text-white/40 text-xs flex items-center gap-2">
                            <Spinner size={12} /> Loading answers…
                          </p>
                        ) : responses.length === 0 ? (
                          <p className="text-white/40 text-xs">No answers recorded.</p>
                        ) : (
                          <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-4 space-y-2">
                            {responses.map((r, i) => (
                              <div key={`${r.questionId}-${r.attempt}-${i}`} className="flex items-start gap-3 text-xs">
                                <span className="text-white/25 shrink-0">#{r.attempt}</span>
                                <span className="text-white/70 flex-1">{r.prompt}</span>
                                <span
                                  className={
                                    r.correct === null
                                      ? "text-white/50"
                                      : r.correct
                                        ? "text-emerald-300"
                                        : "text-rose-300"
                                  }
                                >
                                  {r.answer ?? "skipped"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
