/**
 * Dashboard theme — one global background the admin sets for every member's
 * dashboard: a colour gradient, an image, or a looping video.
 *
 * Reading is public (it's a visual setting the member area needs before any
 * per-user data loads, and it reveals nothing). Writing is admin + `settings`.
 */

import type { FastifyInstance } from "fastify";
import { requireCapability } from "../guard.js";
import { recordAudit } from "../audit.js";
import { notify } from "../notify.js";
import { DEFAULT_THEME, THEME_KEY, dashboardTheme, writeSetting, type DashboardTheme } from "../config.js";
import { isSafeMediaName, mediaExists, mediaUrl } from "../media.js";

/** Resolve an upload name into a URL the browser can actually load. */
function resolved(t: DashboardTheme) {
  const url = t.kind === "image" || t.kind === "video" ? (t.srcKind === "url" ? t.src : mediaUrl(t.src)) : "";
  return { ...t, url };
}

const HEX_OR_CSS = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\))$/;

/** Validate an admin-submitted theme. Returns an error string, or null. */
function validate(t: Partial<DashboardTheme>): string | null {
  const kind = t.kind;
  if (!["default", "gradient", "image", "video"].includes(String(kind))) {
    return "Pick a background type.";
  }

  if (kind === "gradient") {
    const colors = Array.isArray(t.colors) ? t.colors : [];
    if (colors.length < 2) return "A gradient needs at least two colours.";
    if (colors.length > 4) return "Four colours is the maximum.";
    for (const c of colors) {
      // Colours land in a CSS `linear-gradient(...)`, so anything that isn't a
      // plain colour literal is refused rather than escaped — no way to smuggle
      // extra CSS (a url(), another function) into the member's page.
      if (typeof c !== "string" || !HEX_OR_CSS.test(c.trim())) {
        return `"${c}" is not a valid colour.`;
      }
    }
    const angle = Number(t.angle);
    if (!Number.isFinite(angle) || angle < 0 || angle > 360) return "Angle must be 0-360.";
  }

  if (kind === "image" || kind === "video") {
    const src = typeof t.src === "string" ? t.src.trim() : "";
    if (!src) return "Choose an uploaded file or paste a link.";
    if (t.srcKind === "url") {
      if (!/^https:\/\/\S+$/i.test(src)) return "The link must be an https:// URL.";
    } else {
      if (!isSafeMediaName(src)) return "That is not a valid uploaded file.";
      if (!mediaExists(src)) return "That upload no longer exists. Upload it again.";
    }
  }

  const dim = Number(t.dim ?? 0);
  if (!Number.isFinite(dim) || dim < 0 || dim > 100) return "Dim must be 0-100.";
  const blur = Number(t.blur ?? 0);
  if (!Number.isFinite(blur) || blur < 0 || blur > 40) return "Blur must be 0-40.";

  return null;
}

export async function themeRoutes(app: FastifyInstance) {
  // ── Public: the current dashboard theme ──────────────────────────────────
  app.get("/auth/theme", async (_req, reply) => {
    // Short cache: an admin change should show up quickly, but every member
    // dashboard load hits this and it never varies per user.
    reply.header("Cache-Control", "public, max-age=30");
    return reply.send({ ok: true, theme: resolved(dashboardTheme()) });
  });

  // ── Admin: set it ────────────────────────────────────────────────────────
  app.post("/auth/admin/theme", async (req: any, reply) => {
    const me = await requireCapability(req, reply, "settings");
    if (!me) return;

    const body = (req.body ?? {}) as Partial<DashboardTheme>;
    const err = validate(body);
    if (err) return reply.code(400).send({ error: err });

    if (body.kind === "default") {
      writeSetting(THEME_KEY, "");
      recordAudit({ actorId: me.id, actorEmail: me.email, action: "theme.reset" });
      return reply.send({ ok: true, theme: resolved(DEFAULT_THEME) });
    }

    const clean: DashboardTheme = {
      kind: body.kind as DashboardTheme["kind"],
      colors: (Array.isArray(body.colors) ? body.colors : DEFAULT_THEME.colors).map((c) => String(c).trim()),
      angle: Number(body.angle ?? DEFAULT_THEME.angle),
      src: typeof body.src === "string" ? body.src.trim() : "",
      srcKind: body.srcKind === "url" ? "url" : "upload",
      dim: Number(body.dim ?? DEFAULT_THEME.dim),
      blur: Number(body.blur ?? DEFAULT_THEME.blur)
    };
    writeSetting(THEME_KEY, JSON.stringify(clean));

    recordAudit({ actorId: me.id, actorEmail: me.email, action: "theme.set", detail: clean });
    notify(`🎨 <b>Dashboard theme updated</b>\n${clean.kind}\nby ${me.email}`, "content");
    return reply.send({ ok: true, theme: resolved(dashboardTheme()) });
  });
}
