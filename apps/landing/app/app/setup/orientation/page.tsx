"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import {
  fetchOrientation,
  submitOrientation,
  type Orientation,
  type OrientationResult
} from "@/lib/auth-client";
import { clearOrientationGate, resetOrientationGate } from "@/lib/orientation-gate";

/**
 * Orientation — the instructional video and quiz, shown once after the $1
 * activation deposit clears and the member's tokens are minted.
 *
 * Everything on this page is admin-authored (Admin → Orientation): the video,
 * the questions, whether each one is required, and whether a passing score is
 * needed to continue. If nothing is configured, the member never lands here.
 */

type Phase = "loading" | "video" | "quiz" | "result";

/**
 * Turn a pasted link into something embeddable. YouTube and Vimeo need their
 * player URLs; anything else we treat as a direct media file and hand to
 * <video>, which is also the path every uploaded file takes.
 */
function embedFor(url: string): { type: "iframe" | "video"; src: string } {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { type: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return { type: "video", src: url };
}

export default function OrientationPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<Orientation | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<OrientationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quizRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const o = await fetchOrientation();
    // No orientation configured, already done, or the service is unreachable —
    // never strand the member here. The dashboard is the safe default.
    if (!o || !o.required) {
      clearOrientationGate();
      router.replace("/app");
      return;
    }
    setData(o);
    setAnswers({});
    setResult(null);
    setPhase(o.video ? "video" : "quiz");
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = data?.questions ?? [];
  const unanswered = useMemo(
    () => questions.filter((q) => q.required && typeof answers[q.id] !== "number"),
    [questions, answers]
  );

  async function submit() {
    if (!data) return;
    if (unanswered.length > 0) {
      setError(`Please answer ${unanswered.length} more required question${unanswered.length > 1 ? "s" : ""}.`);
      // Take them to the first thing they missed rather than making them hunt.
      document.getElementById(`q-${unanswered[0]!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await submitOrientation(answers);
      // Only lift the gate on a pass — a failed attempt must still be owed.
      if (r.passed) clearOrientationGate();
      setResult(r);
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="w-full min-h-screen bg-black text-white flex items-center justify-center font-sans">
        <div className="flex items-center gap-3 text-white/50 text-sm">
          <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          Loading your orientation…
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-full min-h-screen overflow-x-hidden flex flex-col items-center font-sans bg-black text-white selection:bg-white/20 selection:text-white">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(180,140,255,0.06)_0%,_transparent_60%)]" />

      <section className="relative z-10 w-full max-w-3xl px-6 pt-16 md:pt-24 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6"
        >
          {phase === "result" ? "Orientation" : phase === "video" ? "Orientation · Watch" : "Orientation · Questions"}
        </motion.p>

        {phase === "video" && data?.video && (
          <VideoStep
            title={data.video.title}
            url={data.video.url}
            firstName={user?.firstName}
            hasQuestions={questions.length > 0}
            onContinue={() => {
              setPhase("quiz");
              requestAnimationFrame(() =>
                quizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              );
            }}
            onFinish={() => router.replace("/app")}
          />
        )}

        {phase === "quiz" && (
          <div ref={quizRef}>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="font-serif text-white tracking-tight text-4xl md:text-5xl leading-[1.05]"
            >
              A few <em className="font-serif-i text-white/60">questions</em>.
            </motion.h1>
            <p className="text-white/60 text-sm md:text-base leading-relaxed mt-5">
              {data?.gating === "pass" ? (
                <>
                  Answer every required question. You need{" "}
                  <span className="text-white">{data.passMark}%</span> to continue
                  {data.maxAttempts > 0 ? (
                    <>
                      {" "}
                      — you have{" "}
                      <span className="text-white">
                        {Math.max(0, data.maxAttempts - (data.status.attempts ?? 0))}
                      </span>{" "}
                      attempt
                      {data.maxAttempts - (data.status.attempts ?? 0) === 1 ? "" : "s"} left
                    </>
                  ) : null}
                  .
                </>
              ) : (
                <>Answer the required questions below. There&apos;s no score to beat — we just want to know you got the gist.</>
              )}
            </p>

            <div className="mt-10 space-y-4">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  index={i + 1}
                  question={q}
                  value={answers[q.id] ?? null}
                  onChange={(v) => {
                    setAnswers((a) => ({ ...a, [q.id]: v }));
                    setError(null);
                  }}
                />
              ))}
            </div>

            {error && <p className="mt-6 text-rose-300/90 text-sm">{error}</p>}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                )}
                {busy ? "Submitting…" : "Submit answers"}
              </button>
              <span className="text-white/40 text-xs">
                {questions.filter((q) => q.required).length} required ·{" "}
                {questions.filter((q) => !q.required).length} optional
              </span>
            </div>
          </div>
        )}

        {phase === "result" && result && (
          <ResultStep
            result={result}
            gating={data?.gating ?? "answer"}
            onContinue={() => router.replace("/app")}
            onRetry={() => {
              resetOrientationGate();
              setPhase("loading");
              void load();
            }}
          />
        )}
      </section>
    </main>
  );
}

function VideoStep({
  title,
  url,
  firstName,
  hasQuestions,
  onContinue,
  onFinish
}: {
  title: string;
  url: string;
  firstName?: string | null;
  hasQuestions: boolean;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const embed = embedFor(url);
  return (
    <>
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="font-serif text-white tracking-tight text-4xl md:text-5xl leading-[1.05]"
      >
        Welcome in{firstName ? `, ${firstName}` : ""}
        <em className="font-serif-i text-white/60">.</em>
      </motion.h1>
      <p className="text-white/60 text-sm md:text-base leading-relaxed mt-5">
        {title || "Watch this short walkthrough before you start — it covers how your tokens, wallet and the Circle fit together."}
      </p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="mt-8 rounded-3xl overflow-hidden ring-1 ring-white/10 bg-white/[0.02]"
      >
        <div className="relative w-full aspect-video">
          {embed.type === "iframe" ? (
            <iframe
              src={embed.src}
              title={title || "Orientation"}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video src={embed.src} controls playsInline className="absolute inset-0 w-full h-full bg-black">
              Your browser can&apos;t play this video.
            </video>
          )}
        </div>
      </motion.div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={hasQuestions ? onContinue : onFinish}
          className="rounded-full bg-white text-black px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90"
        >
          {hasQuestions ? "Continue to the questions →" : "Go to my dashboard →"}
        </button>
        <span className="text-white/40 text-xs">You can come back to this from your dashboard.</span>
      </div>
    </>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange
}: {
  index: number;
  question: { id: string; prompt: string; options: string[]; required: boolean; graded: boolean };
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div
      id={`q-${question.id}`}
      className="liquid-glass rounded-3xl p-5 md:p-6 ring-1 ring-white/10"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-white text-sm md:text-base leading-relaxed">
          <span className="text-white/30 mr-2">{index}.</span>
          {question.prompt}
        </p>
        {question.required ? (
          <span className="shrink-0 rounded-full bg-white/10 text-white/60 text-[10px] tracking-wide uppercase px-2 py-1">
            Required
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-white/[0.04] text-white/40 text-[10px] tracking-wide uppercase px-2 py-1">
            Optional
          </span>
        )}
      </div>

      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const selected = value === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`w-full text-left rounded-2xl px-4 py-3 text-sm transition-colors ring-1 ${
                selected
                  ? "bg-white/10 ring-white/40 text-white"
                  : "bg-white/[0.02] ring-white/10 text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              <span
                className={`inline-block w-3.5 h-3.5 rounded-full mr-3 align-middle ring-1 ${
                  selected ? "bg-white ring-white" : "ring-white/30"
                }`}
              />
              {opt}
            </button>
          );
        })}
      </div>

      {!question.required && value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-3 text-white/40 hover:text-white/70 text-xs underline transition-colors"
        >
          Clear this answer
        </button>
      )}
    </div>
  );
}

function ResultStep({
  result,
  gating,
  onContinue,
  onRetry
}: {
  result: OrientationResult;
  gating: string;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const passed = result.passed;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <h1 className="font-serif text-white tracking-tight text-4xl md:text-5xl leading-[1.05]">
        {passed ? (
          <>
            You&apos;re <em className="font-serif-i text-white/60">in</em>.
          </>
        ) : (
          <>
            Not quite <em className="font-serif-i text-white/60">yet</em>.
          </>
        )}
      </h1>

      {result.score !== null && (
        <div className="mt-8 flex items-baseline gap-3">
          <span className={`font-serif text-6xl ${passed ? "text-emerald-300" : "text-amber-300"}`}>
            {result.score}%
          </span>
          {typeof result.correctCount === "number" && typeof result.gradedCount === "number" && (
            <span className="text-white/40 text-sm">
              {result.correctCount} of {result.gradedCount} correct
              {gating === "pass" && typeof result.passMark === "number" ? ` · ${result.passMark}% to pass` : ""}
            </span>
          )}
        </div>
      )}

      <p className="text-white/60 text-sm md:text-base leading-relaxed mt-6">
        {passed
          ? "That's everything. Your dashboard is ready."
          : result.canRetry
            ? "Have another look at the video and try again — your answers so far have been saved."
            : "You've used all your attempts. Contact support and we'll reset your orientation."}
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        {passed ? (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-white text-black px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Go to my dashboard →
          </button>
        ) : result.canRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-white text-black px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Try again →
          </button>
        ) : (
          <a
            href="mailto:support@ggakingclub.com"
            className="rounded-full bg-white text-black px-7 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Contact support →
          </a>
        )}
      </div>
    </motion.div>
  );
}
