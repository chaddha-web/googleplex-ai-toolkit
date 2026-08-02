"use client";

/**
 * Admin → Theme. One global background for every member's dashboard: a colour
 * gradient, an image, or a looping video.
 *
 * Everything is previewed here before it ships — the preview panel uses the
 * exact same layer stack as components/dashboard-background.tsx, so what you
 * see is what members get.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner, ProgressBar, BusyLabel, Skeleton } from "@/components/admin/ui";
import {
  DEFAULT_DASHBOARD_THEME,
  adminDeleteMedia,
  adminMediaList,
  adminSetTheme,
  adminUploadMediaWithProgress,
  fetchDashboardTheme,
  type DashboardTheme,
  type MediaFile,
  type UploadProgress
} from "@/lib/auth-client";

const PRESETS: Array<{ name: string; colors: string[]; angle: number }> = [
  { name: "Midnight", colors: ["#0b0b12", "#12081f"], angle: 160 },
  { name: "Violet haze", colors: ["#0a0715", "#2a1155", "#0a0715"], angle: 145 },
  { name: "Deep ocean", colors: ["#04121c", "#0a3a4a"], angle: 170 },
  { name: "Ember", colors: ["#150806", "#3d1206", "#0d0503"], angle: 155 },
  { name: "Forest", colors: ["#04120c", "#0c3524"], angle: 165 },
  { name: "Slate", colors: ["#0d0d0f", "#1e1e24"], angle: 180 }
];

const KINDS: Array<{ id: DashboardTheme["kind"]; label: string; hint: string }> = [
  { id: "default", label: "Default", hint: "The stock black dashboard. Nothing overridden." },
  { id: "gradient", label: "Gradient", hint: "Two to four colours. Cheapest to load, always crisp." },
  { id: "image", label: "Image", hint: "A photo or artwork, cover-fitted to the viewport." },
  { id: "video", label: "Video", hint: "Muted, looping, autoplaying. Keep it short and small." }
];

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

export default function ThemeAdminPage() {
  const [theme, setTheme] = useState<DashboardTheme | null>(null);
  const [saved, setSaved] = useState<DashboardTheme | null>(null);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(true);
  const abortRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    try {
      const r = await adminMediaList();
      setMedia(r.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardTheme().then((t) => {
      setTheme(t);
      setSaved(t);
    });
    void loadMedia();
  }, [loadMedia]);

  if (!theme) {
    return (
      <section className="max-w-6xl mx-auto">
        <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Appearance</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
          Dashboard <em className="font-serif-i text-white/60">theme</em>.
        </h1>
        <div className="mt-8 grid lg:grid-cols-[1fr_420px] gap-4 items-start">
          <div className="space-y-4">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <Skeleton className="aspect-[9/16] max-h-[520px] rounded-2xl" />
        </div>
      </section>
    );
  }

  const set = (patch: Partial<DashboardTheme>) => {
    setTheme({ ...theme, ...patch });
    setNote(null);
  };

  const dirty = JSON.stringify(theme) !== JSON.stringify(saved);
  const needsSrc = (theme.kind === "image" || theme.kind === "video") && !theme.src;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await adminSetTheme(theme!);
      setTheme(r.theme);
      setSaved(r.theme);
      setNote("Theme saved. Members will see it on their next dashboard load.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setFinishing(false);
    setProgress({ percent: 0, loaded: 0, total: file.size, bps: 0, etaSeconds: null });
    const job = adminUploadMediaWithProgress(file, (p) => {
      setProgress(p);
      if (p.percent !== null && p.percent >= 100) setFinishing(true);
    });
    abortRef.current = job.abort;
    try {
      const up = await job.promise;
      await loadMedia();
      set({ src: up.name, srcKind: "upload" });
      setNote(`Uploaded ${mb(up.size)}. Hit save to apply it.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
      setFinishing(false);
      abortRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const wantsVideo = theme.kind === "video";
  const relevantMedia = media.filter((m) =>
    wantsVideo ? m.type.startsWith("video/") : m.type.startsWith("image/")
  );

  return (
    <section className="max-w-6xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Appearance</p>
      <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
        Dashboard <em className="font-serif-i text-white/60">theme</em>.
      </h1>
      <p className="text-white/50 text-sm mt-3 max-w-2xl">
        One background for every member&apos;s dashboard. The admin panel keeps its own styling.
      </p>

      {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}
      {note && <p className="mt-6 text-emerald-300/90 text-sm">{note}</p>}

      <div className="mt-8 grid lg:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="space-y-4">
          {/* Kind */}
          <div className="liquid-glass rounded-2xl p-6">
            <h2 className="font-serif text-2xl tracking-tight">Background type</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => set({ kind: k.id })}
                  className={`text-left rounded-xl px-4 py-3 ring-1 transition-colors ${
                    theme.kind === k.id
                      ? "bg-white/10 ring-white/40"
                      : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="text-white text-sm">{k.label}</span>
                  <span className="block text-white/40 text-xs mt-0.5">{k.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Gradient */}
          {theme.kind === "gradient" && (
            <div className="liquid-glass rounded-2xl p-6">
              <h2 className="font-serif text-2xl tracking-tight">Colours</h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => set({ colors: p.colors, angle: p.angle })}
                    className="rounded-xl ring-1 ring-white/10 hover:ring-white/30 overflow-hidden transition-all"
                    title={p.name}
                  >
                    <span
                      className="block w-20 h-10"
                      style={{ backgroundImage: `linear-gradient(${p.angle}deg, ${p.colors.join(", ")})` }}
                    />
                    <span className="block text-white/50 text-[10px] px-2 py-1">{p.name}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {theme.colors.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#000000"}
                      onChange={(e) => {
                        const next = [...theme.colors];
                        next[i] = e.target.value;
                        set({ colors: next });
                      }}
                      className="w-10 h-10 rounded-lg bg-transparent cursor-pointer"
                    />
                    <input
                      value={c}
                      onChange={(e) => {
                        const next = [...theme.colors];
                        next[i] = e.target.value;
                        set({ colors: next });
                      }}
                      className="flex-1 rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2 text-sm text-white outline-none focus:ring-white/30 font-mono"
                    />
                    {theme.colors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => set({ colors: theme.colors.filter((_, k) => k !== i) })}
                        className="text-white/30 hover:text-rose-300 text-lg px-1"
                        title="Remove colour"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {theme.colors.length < 4 && (
                  <button
                    type="button"
                    onClick={() => set({ colors: [...theme.colors, "#000000"] })}
                    className="text-white/50 hover:text-white text-xs underline"
                  >
                    Add colour
                  </button>
                )}
              </div>

              <Slider
                label="Angle"
                value={theme.angle}
                min={0}
                max={360}
                suffix="°"
                onChange={(v) => set({ angle: v })}
              />
            </div>
          )}

          {/* Image / video source */}
          {(theme.kind === "image" || theme.kind === "video") && (
            <div className="liquid-glass rounded-2xl p-6">
              <h2 className="font-serif text-2xl tracking-tight">
                {theme.kind === "video" ? "The video" : "The image"}
              </h2>
              <p className="text-white/40 text-xs mt-1">
                {theme.kind === "video"
                  ? "Plays muted on a loop. A short, heavily-compressed clip keeps the dashboard fast."
                  : "Cover-fitted, so it fills the viewport at any aspect ratio."}
              </p>

              <div className="mt-4 flex gap-2">
                {(["upload", "url"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ srcKind: k, src: "" })}
                    className={`rounded-full px-4 py-1.5 text-xs ring-1 transition-colors ${
                      theme.srcKind === k
                        ? "bg-white/10 ring-white/40 text-white"
                        : "ring-white/10 text-white/50 hover:text-white/80"
                    }`}
                  >
                    {k === "upload" ? "From library" : "Paste a link"}
                  </button>
                ))}
              </div>

              {theme.srcKind === "url" ? (
                <input
                  value={theme.src}
                  onChange={(e) => set({ src: e.target.value })}
                  placeholder="https://…"
                  className="mt-4 w-full rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-white/30"
                />
              ) : (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={theme.kind === "video" ? "video/mp4,video/webm" : "image/*"}
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                    className="mt-4 block w-full text-sm text-white/60 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-5 file:py-2 file:text-sm file:text-black hover:file:opacity-90 disabled:opacity-50"
                  />

                  {progress && (
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
                  )}

                  {mediaLoading && (
                    <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-video rounded-xl" />
                      ))}
                    </div>
                  )}

                  {!mediaLoading && relevantMedia.length === 0 && (
                    <p className="mt-4 text-white/35 text-xs">
                      Nothing in the library yet — upload {theme.kind === "video" ? "a video" : "an image"} above.
                    </p>
                  )}

                  {!mediaLoading && relevantMedia.length > 0 && (
                    <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {relevantMedia.map((m) => (
                        <div
                          key={m.name}
                          className={`group relative rounded-xl overflow-hidden ring-1 transition-all ${
                            theme.src === m.name ? "ring-white/60" : "ring-white/10 hover:ring-white/30"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => set({ src: m.name, srcKind: "upload" })}
                            className="block w-full"
                          >
                            <span className="block w-full aspect-video bg-black/50">
                              {m.type.startsWith("image/") ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <video src={m.url} muted className="w-full h-full object-cover" />
                              )}
                            </span>
                            <span className="block text-white/40 text-[10px] px-2 py-1 truncate">
                              {mb(m.size)}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={deletingName === m.name}
                            onClick={async () => {
                              setDeletingName(m.name);
                              try {
                                await adminDeleteMedia(m.name);
                                await loadMedia();
                              } catch (e) {
                                setError((e as Error).message);
                              } finally {
                                setDeletingName(null);
                              }
                            }}
                            className={`absolute top-1.5 right-1.5 rounded-full bg-black/70 text-white/60 hover:text-rose-300 w-6 h-6 text-sm transition-opacity ${
                              deletingName === m.name ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                            title="Delete this file"
                          >
                            {deletingName === m.name ? <Spinner size={11} /> : "×"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <Slider label="Blur" value={theme.blur} min={0} max={40} suffix="px" onChange={(v) => set({ blur: v })} />
            </div>
          )}

          {/* Dim */}
          {theme.kind !== "default" && (
            <div className="liquid-glass rounded-2xl p-6">
              <h2 className="font-serif text-2xl tracking-tight">Legibility</h2>
              <p className="text-white/40 text-xs mt-1">
                A black scrim over the background. Turn this up until the dashboard text is comfortable to read.
              </p>
              <Slider label="Dim" value={theme.dim} min={0} max={100} suffix="%" onChange={(v) => set({ dim: v })} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty || needsSrc}
              className="rounded-full bg-white text-black px-6 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              <BusyLabel busy={busy} busyText="Saving…">
                {dirty ? "Save theme" : "Saved"}
              </BusyLabel>
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setTheme(saved);
                  setNote(null);
                }}
                className="text-white/50 hover:text-white text-sm underline"
              >
                Discard changes
              </button>
            )}
            {theme.kind !== "default" && (
              <button
                type="button"
                onClick={() => set({ ...DEFAULT_DASHBOARD_THEME })}
                className="text-white/40 hover:text-white text-sm underline ml-auto"
              >
                Reset to default
              </button>
            )}
            {needsSrc && (
              <span className="text-amber-200/70 text-xs">
                Pick {theme.kind === "video" ? "a video" : "an image"} first.
              </span>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6">
          <p className="text-white/40 text-[11px] tracking-[0.2em] uppercase mb-2">Preview</p>
          <Preview theme={theme} media={media} />
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block mt-5">
      <span className="flex items-center justify-between text-white/50 text-xs">
        <span>{label}</span>
        <span className="text-white/70">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-white"
      />
    </label>
  );
}

/**
 * Mirrors components/dashboard-background.tsx exactly, scaled into a card, so
 * the admin is looking at the real thing rather than an approximation.
 */
function Preview({ theme, media }: { theme: DashboardTheme; media: MediaFile[] }) {
  // A pasted link is already a URL; a library pick is a bare filename, so look
  // its URL up in the library. `theme.url` covers the just-loaded saved theme,
  // before the media list has arrived.
  const resolved =
    theme.srcKind === "url"
      ? theme.src.trim()
      : (media.find((m) => m.name === theme.src)?.url ?? theme.url ?? "");
  const filter = theme.blur > 0 ? `blur(${theme.blur}px)` : undefined;

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 aspect-[9/16] max-h-[520px] bg-black">
      {theme.kind === "gradient" && (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(${theme.angle}deg, ${theme.colors.join(", ")})` }}
        />
      )}
      {theme.kind === "image" && resolved && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: theme.blur > 0 ? "scale(1.06)" : undefined }}
        />
      )}
      {theme.kind === "video" && resolved && (
        <video
          src={resolved}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter, transform: theme.blur > 0 ? "scale(1.06)" : undefined }}
        />
      )}
      {theme.dim > 0 && theme.kind !== "default" && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.dim / 100})` }} />
      )}

      {/* A stand-in for the dashboard's own content, to judge legibility. */}
      <div className="relative h-full p-5 flex flex-col justify-between">
        <div>
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Dashboard</p>
          <p className="font-serif text-3xl tracking-tight mt-2 text-white">
            Good evening<em className="font-serif-i text-white/60">.</em>
          </p>
        </div>
        <div className="space-y-2">
          <div className="liquid-glass rounded-xl px-4 py-3">
            <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase">Balance</p>
            <p className="text-white text-2xl font-light mt-1">$1,240.00</p>
          </div>
          <div className="liquid-glass rounded-xl px-4 py-3">
            <p className="text-white/50 text-xs">Body copy sits at this contrast.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
