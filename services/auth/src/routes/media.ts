/**
 * Admin media library — the orientation video and the dashboard background.
 *
 * Upload/list/delete only. Serving is nginx's job: files land in the shared
 * media volume and are fetched from MEDIA_BASE_URL, which already does byte
 * ranges and immutable caching. See services/auth/src/media.ts.
 */

import type { FastifyInstance } from "fastify";
import { requireCapability } from "../guard.js";
import { recordAudit } from "../audit.js";
import { notify } from "../notify.js";
import { dashboardTheme, onboardingConfig } from "../config.js";
import {
  MAX_UPLOAD_BYTES,
  MEDIA_BASE_URL,
  deleteMedia,
  isSafeMediaName,
  listMedia,
  mediaPath,
  mediaUrl,
  newMediaName
} from "../media.js";
import { createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { MEDIA_DIR } from "../media.js";

function humanMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function mediaRoutes(app: FastifyInstance) {
  // ── Admin: upload ────────────────────────────────────────────────────────
  app.post("/auth/admin/media", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;

    if (!req.isMultipart?.()) {
      return reply.code(400).send({ error: "Send the file as multipart/form-data." });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file in the request." });

    const name = newMediaName(file.mimetype);
    if (!name) {
      // Drain the stream so the connection closes cleanly on rejection.
      file.file.resume();
      return reply.code(400).send({
        error: `Unsupported file type "${file.mimetype}". Allowed: MP4, WebM, MOV, JPG, PNG, WebP, GIF, AVIF.`
      });
    }

    mkdirSync(MEDIA_DIR, { recursive: true });
    const dest = mediaPath(name);
    const cleanup = () => {
      try {
        unlinkSync(dest);
      } catch {
        /* nothing written, or already gone */
      }
    };

    try {
      await pipeline(file.file, createWriteStream(dest));
    } catch (err) {
      cleanup();
      req.log.error({ err }, "[media] upload write failed");
      return reply.code(500).send({ error: "Upload failed while writing the file." });
    }

    // @fastify/multipart flags truncation instead of throwing — a truncated
    // file looks fine on disk and plays back broken, so drop it and say so.
    if (file.file.truncated) {
      cleanup();
      return reply
        .code(413)
        .send({ error: `File is larger than the ${humanMb(MAX_UPLOAD_BYTES)} limit.` });
    }

    const size = statSync(dest).size;
    recordAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "media.upload",
      targetLabel: name,
      detail: { size, mimetype: file.mimetype, original: file.filename }
    });
    notify(`🎬 <b>Media uploaded</b>\n<code>${name}</code> · ${humanMb(size)}\nby ${me.email}`, "content");
    return reply.send({ ok: true, name, size, url: mediaUrl(name) });
  });

  // ── Admin: list ──────────────────────────────────────────────────────────
  app.get("/auth/admin/media", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    return reply.send({
      ok: true,
      files: listMedia(),
      baseUrl: MEDIA_BASE_URL,
      maxBytes: MAX_UPLOAD_BYTES
    });
  });

  // ── Admin: delete ────────────────────────────────────────────────────────
  app.delete("/auth/admin/media/:name", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;
    const name = String(req.params.name ?? "");
    if (!isSafeMediaName(name)) return reply.code(400).send({ error: "Bad file name." });

    // Refuse to delete something still wired up — otherwise the orientation
    // video or the dashboard background silently 404s for every member.
    const cfg = onboardingConfig();
    if (cfg.video?.kind === "upload" && cfg.video.src === name) {
      return reply
        .code(409)
        .send({ error: "This file is the current orientation video. Replace it first." });
    }
    const theme = dashboardTheme();
    if (theme.kind !== "default" && theme.srcKind === "upload" && theme.src === name) {
      return reply
        .code(409)
        .send({ error: "This file is the current dashboard background. Change the theme first." });
    }

    if (!deleteMedia(name)) return reply.code(404).send({ error: "Not found." });
    recordAudit({ actorId: me.id, actorEmail: me.email, action: "media.delete", targetLabel: name });
    return reply.send({ ok: true });
  });
}
