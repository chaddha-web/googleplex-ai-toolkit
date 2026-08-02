/**
 * Orientation — the instructional video and quiz a member sees once, right
 * after the $1 initial deposit clears and their tokens are minted.
 *
 * Gating is the admin's call (see `Gating` in config.ts):
 *   off    — nothing is shown; the member goes straight to the dashboard.
 *   answer — every REQUIRED question must be answered; any score gets through.
 *   pass   — must also score at or above the pass mark, otherwise retry.
 *
 * Questions can individually be marked optional, which lets the admin mix
 * "you must know this" with "we'd like to know this about you".
 *
 * The correct answers never leave this service on the member endpoints —
 * grading happens here, and `GET /auth/onboarding` strips `correct_index`.
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { db, stmts, type OnboardingQuestionRow } from "../db.js";
import { requireUser, requireCapability } from "../guard.js";
import { recordAudit } from "../audit.js";
import { notify } from "../notify.js";
import { isSafeMediaName, mediaExists, mediaUrl } from "../media.js";
import {
  ONBOARDING_KEYS,
  onboardingConfig,
  writeSetting,
  type Gating,
  type OnboardingVideo
} from "../config.js";

/**
 * Resolve the stored video into something the browser can load: an upload is
 * stored as a bare media filename, an external link is stored whole.
 */
function withVideoUrl(v: OnboardingVideo | null) {
  if (!v) return null;
  return { ...v, url: v.kind === "url" ? v.src : mediaUrl(v.src) };
}

/** Parse the stored options blob, tolerating a corrupt row rather than 500ing. */
function optionsOf(q: OnboardingQuestionRow): string[] {
  try {
    const arr = JSON.parse(q.options_json);
    return Array.isArray(arr) ? arr.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/** The member-safe shape: no correct answer. */
function publicQuestion(q: OnboardingQuestionRow) {
  return {
    id: q.id,
    prompt: q.prompt,
    options: optionsOf(q),
    required: !!q.required,
    /** True when this question is graded — lets the UI say "counts toward your score". */
    graded: q.correct_index !== null
  };
}

function adminQuestion(q: OnboardingQuestionRow) {
  return {
    id: q.id,
    prompt: q.prompt,
    options: optionsOf(q),
    correctIndex: q.correct_index,
    required: !!q.required,
    sortOrder: q.sort_order,
    active: !!q.active,
    createdAt: q.created_at,
    updatedAt: q.updated_at
  };
}

/** Validate an admin-submitted question. Returns an error string, or null. */
function validateQuestion(body: any): string | null {
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) return "The question text is required.";
  if (prompt.length > 500) return "Keep the question under 500 characters.";

  const options = Array.isArray(body?.options)
    ? body.options.map((o: unknown) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
    : [];
  if (options.length < 2) return "Give at least two answer options.";
  if (options.length > 8) return "Eight options is the maximum.";

  const ci = body?.correctIndex;
  if (ci !== null && ci !== undefined) {
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= options.length) {
      return "The correct answer must be one of the options.";
    }
  }
  return null;
}

export async function onboardingRoutes(app: FastifyInstance) {
  // ── Member: what to show me ──────────────────────────────────────────────
  app.get("/auth/onboarding", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;

    const cfg = onboardingConfig();
    const questions = stmts.onboarding.activeQuestions.all().map(publicQuestion);
    const attempts = me.onboarding_attempts ?? 0;
    const outOfAttempts = cfg.maxAttempts > 0 && attempts >= cfg.maxAttempts;

    return reply.send({
      ok: true,
      // `required` is what the client uses to decide whether to hold the member
      // here. Nothing to ask → never block, even if gating is on.
      required: cfg.gating !== "off" && questions.length > 0 && !me.onboarding_completed_at,
      gating: cfg.gating,
      passMark: cfg.passMark,
      maxAttempts: cfg.maxAttempts,
      video: withVideoUrl(cfg.video),
      questions,
      status: {
        completedAt: me.onboarding_completed_at,
        score: me.onboarding_score,
        attempts,
        outOfAttempts
      }
    });
  });

  // ── Member: submit answers ───────────────────────────────────────────────
  app.post("/auth/onboarding/submit", async (req: any, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;

    const cfg = onboardingConfig();
    if (cfg.gating === "off") {
      return reply.send({ ok: true, passed: true, completed: true, score: null, skipped: true });
    }

    const questions = stmts.onboarding.activeQuestions.all();
    if (questions.length === 0) {
      return reply.send({ ok: true, passed: true, completed: true, score: null, skipped: true });
    }

    const attempts = me.onboarding_attempts ?? 0;
    if (cfg.maxAttempts > 0 && attempts >= cfg.maxAttempts) {
      return reply.code(429).send({
        error: `You've used all ${cfg.maxAttempts} attempts. Contact support to reset your orientation.`
      });
    }

    const raw = (req.body ?? {}) as { answers?: Record<string, unknown> };
    const answers = raw.answers && typeof raw.answers === "object" ? raw.answers : {};

    // Every REQUIRED question must carry a real answer. Optional ones may be
    // absent or null, and simply don't count toward the score.
    const missing: string[] = [];
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id];
      if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a >= optionsOf(q).length) {
        missing.push(q.id);
      }
    }
    if (missing.length > 0) {
      return reply
        .code(400)
        .send({ error: "Please answer every required question.", missing });
    }

    const attempt = attempts + 1;
    const now = Date.now();
    let graded = 0;
    let correctCount = 0;
    const rows: any[] = [];

    for (const q of questions) {
      const a = answers[q.id];
      const answerIndex =
        typeof a === "number" && Number.isInteger(a) && a >= 0 && a < optionsOf(q).length ? a : null;
      let correct: number | null = null;
      if (q.correct_index !== null) {
        graded += 1;
        correct = answerIndex !== null && answerIndex === q.correct_index ? 1 : 0;
        if (correct) correctCount += 1;
      }
      rows.push({
        id: randomUUID(),
        user_id: me.id,
        question_id: q.id,
        attempt,
        answer_index: answerIndex,
        correct,
        created_at: now
      });
    }

    // A quiz with no graded questions is a survey: answering IS passing.
    const score = graded > 0 ? Math.round((correctCount / graded) * 100) : null;
    const passed = cfg.gating === "pass" && graded > 0 ? (score ?? 0) >= cfg.passMark : true;

    const best = score === null ? me.onboarding_score : Math.max(score, me.onboarding_score ?? 0);

    // One transaction: the responses and the attempt counter move together, so
    // a crash can't hand out an unearned completion or eat an attempt silently.
    db.transaction(() => {
      for (const r of rows) stmts.onboarding.insertResponse.run(r);
      stmts.onboarding.markAttempt.run({
        id: me.id,
        onboarding_score: best,
        onboarding_completed_at: passed ? (me.onboarding_completed_at ?? now) : null,
        updated_at: now
      });
    })();

    const usedAttempts = attempt;
    const canRetry = !passed && (cfg.maxAttempts === 0 || usedAttempts < cfg.maxAttempts);

    if (passed) {
      recordAudit({
        actorId: me.id,
        actorEmail: me.email,
        action: "onboarding.complete",
        targetId: me.id,
        detail: { score, attempt }
      });
    }

    return reply.send({
      ok: true,
      passed,
      completed: passed,
      score,
      correctCount,
      gradedCount: graded,
      total: questions.length,
      passMark: cfg.passMark,
      attempts: usedAttempts,
      canRetry
    });
  });

  // ── Admin: everything, including the answer key ──────────────────────────
  app.get("/auth/admin/onboarding", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const cfg = onboardingConfig();
    return reply.send({
      ok: true,
      config: { ...cfg, video: withVideoUrl(cfg.video) },
      questions: stmts.onboarding.allQuestions.all().map(adminQuestion),
      completions: stmts.onboarding.completions.all()
    });
  });

  // ── Admin: video + gating config ─────────────────────────────────────────
  app.post("/auth/admin/onboarding/config", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const b = (req.body ?? {}) as any;

    if (b.gating !== undefined) {
      const g = b.gating as Gating;
      if (!["off", "answer", "pass"].includes(g)) {
        return reply.code(400).send({ error: "Gating must be off, answer or pass." });
      }
      writeSetting(ONBOARDING_KEYS.gating, g);
    }
    if (b.passMark !== undefined) {
      const n = Number(b.passMark);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return reply.code(400).send({ error: "Pass mark must be between 0 and 100." });
      }
      writeSetting(ONBOARDING_KEYS.passMark, String(Math.round(n)));
    }
    if (b.maxAttempts !== undefined) {
      const n = Number(b.maxAttempts);
      if (!Number.isFinite(n) || n < 0 || n > 50) {
        return reply.code(400).send({ error: "Attempts must be between 0 (unlimited) and 50." });
      }
      writeSetting(ONBOARDING_KEYS.maxAttempts, String(Math.floor(n)));
    }
    if (b.video !== undefined) {
      if (b.video === null) {
        writeSetting(ONBOARDING_KEYS.video, "");
      } else {
        const v = b.video as Partial<OnboardingVideo>;
        const kind = v.kind === "url" ? "url" : "upload";
        const src = typeof v.src === "string" ? v.src.trim() : "";
        if (!src) return reply.code(400).send({ error: "Pick an uploaded file or paste a link." });
        if (kind === "url") {
          if (!/^https:\/\/\S+$/i.test(src)) {
            return reply.code(400).send({ error: "The video link must be an https:// URL." });
          }
        } else {
          // Catch a stale pick now, rather than showing every member a video
          // element pointed at a 404.
          if (!isSafeMediaName(src)) return reply.code(400).send({ error: "That is not a valid upload." });
          if (!mediaExists(src)) {
            return reply.code(400).send({ error: "That upload no longer exists. Upload it again." });
          }
        }
        writeSetting(
          ONBOARDING_KEYS.video,
          JSON.stringify({ kind, src, title: typeof v.title === "string" ? v.title.slice(0, 200) : "" })
        );
      }
    }

    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "onboarding.config",
      detail: onboardingConfig()
    });
    notify(`🎓 <b>Orientation updated</b>\nby ${me.email}`, "content");
    const fresh = onboardingConfig();
    return reply.send({ ok: true, config: { ...fresh, video: withVideoUrl(fresh.video) } });
  });

  // ── Admin: create a question ─────────────────────────────────────────────
  app.post("/auth/admin/onboarding/questions", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const err = validateQuestion(req.body);
    if (err) return reply.code(400).send({ error: err });

    const b = req.body as any;
    const options: string[] = b.options.map((o: string) => o.trim()).filter(Boolean);
    const now = Date.now();
    const id = randomUUID();
    stmts.onboarding.insertQuestion.run({
      id,
      prompt: String(b.prompt).trim(),
      options_json: JSON.stringify(options),
      correct_index: b.correctIndex === null || b.correctIndex === undefined ? null : Number(b.correctIndex),
      required: b.required === false ? 0 : 1,
      sort_order: (stmts.onboarding.maxSort.get()?.n ?? 0) + 1,
      active: b.active === false ? 0 : 1,
      created_at: now,
      updated_at: now
    });
    recordAudit({ actorId: me.id, actorEmail: me.email, action: "onboarding.question.create", targetId: id });
    return reply.send({ ok: true, question: adminQuestion(stmts.onboarding.questionById.get(id)!) });
  });

  // ── Admin: update a question ─────────────────────────────────────────────
  app.patch("/auth/admin/onboarding/questions/:id", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const existing = stmts.onboarding.questionById.get(String(req.params.id));
    if (!existing) return reply.code(404).send({ error: "No such question." });

    const b = { ...adminQuestion(existing), ...(req.body ?? {}) } as any;
    const err = validateQuestion(b);
    if (err) return reply.code(400).send({ error: err });

    const options: string[] = b.options.map((o: string) => String(o).trim()).filter(Boolean);
    stmts.onboarding.updateQuestion.run({
      id: existing.id,
      prompt: String(b.prompt).trim(),
      options_json: JSON.stringify(options),
      correct_index: b.correctIndex === null || b.correctIndex === undefined ? null : Number(b.correctIndex),
      required: b.required === false ? 0 : 1,
      sort_order: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : existing.sort_order,
      active: b.active === false ? 0 : 1,
      updated_at: Date.now()
    });
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "onboarding.question.update",
      targetId: existing.id
    });
    return reply.send({ ok: true, question: adminQuestion(stmts.onboarding.questionById.get(existing.id)!) });
  });

  // ── Admin: delete a question ─────────────────────────────────────────────
  app.delete("/auth/admin/onboarding/questions/:id", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const id = String(req.params.id);
    if (!stmts.onboarding.questionById.get(id)) {
      return reply.code(404).send({ error: "No such question." });
    }
    // Past responses are deliberately left in place — they are the record of
    // what a member was actually asked, and deleting them would rewrite it.
    stmts.onboarding.deleteQuestion.run(id);
    recordAudit({ actorId: me.id, actorEmail: me.email, action: "onboarding.question.delete", targetId: id });
    return reply.send({ ok: true });
  });

  // ── Admin: reorder ───────────────────────────────────────────────────────
  app.post("/auth/admin/onboarding/reorder", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const ids = Array.isArray((req.body as any)?.ids) ? (req.body as any).ids : [];
    let order = 0;
    for (const id of ids) {
      const q = stmts.onboarding.questionById.get(String(id));
      if (!q) continue;
      order += 1;
      stmts.onboarding.updateQuestion.run({
        id: q.id,
        prompt: q.prompt,
        options_json: q.options_json,
        correct_index: q.correct_index,
        required: q.required,
        sort_order: order,
        active: q.active,
        updated_at: Date.now()
      });
    }
    return reply.send({ ok: true });
  });

  // ── Admin: one member's answers ──────────────────────────────────────────
  app.get("/auth/admin/onboarding/responses/:userId", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const rows = stmts.onboarding.responsesForUser.all(String(req.params.userId)) as any[];
    return reply.send({
      ok: true,
      responses: rows.map((r) => {
        let options: string[] = [];
        try {
          options = JSON.parse(r.options_json ?? "[]");
        } catch {
          options = [];
        }
        return {
          questionId: r.question_id,
          prompt: r.prompt ?? "(question deleted)",
          attempt: r.attempt,
          answerIndex: r.answer_index,
          answer: r.answer_index === null ? null : (options[r.answer_index] ?? null),
          correctIndex: r.correct_index,
          correct: r.correct === null ? null : !!r.correct,
          createdAt: r.created_at
        };
      })
    });
  });

  // ── Admin: let a member sit it again ─────────────────────────────────────
  app.post("/auth/admin/onboarding/reset/:userId", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const target = stmts.user.byId.get(String(req.params.userId));
    if (!target) return reply.code(404).send({ error: "No such member." });
    stmts.onboarding.resetForUser.run({ id: target.id, updated_at: Date.now() });
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "onboarding.reset",
      targetId: target.id,
      targetLabel: target.email
    });
    return reply.send({ ok: true });
  });
}
