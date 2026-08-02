/**
 * Admin-uploaded media (orientation video, dashboard background image/video).
 *
 * Files are written into the SAME host media volume the avatar upload uses and
 * are served by the nginx `media` container at UPLOAD_BASE_URL — not by this
 * service. nginx already does byte-range and long-lived caching properly, which
 * is exactly what a 10-minute video needs, and it keeps hundreds of MB of range
 * requests off the Node event loop.
 *
 * Nothing here trusts the client's filename. We generate our own name from a
 * random id plus an extension chosen from an allowlist of content types, so a
 * caller cannot pick the extension, traverse out of the directory, or land an
 * executable/HTML file on a domain that serves our cookies.
 */

import { mkdirSync, statSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/** Host dir shared with the nginx media container (see docker-compose.prod.yml). */
export const MEDIA_DIR = resolve(process.env.UPLOAD_DIR ?? "./media/uploads");

/** Public origin nginx serves MEDIA_DIR from. */
export const MEDIA_BASE_URL = (
  process.env.UPLOAD_BASE_URL ?? "https://ggakingclub.com/media/uploads"
).replace(/\/$/, "");

try {
  mkdirSync(MEDIA_DIR, { recursive: true });
} catch {
  /* created on first upload instead */
}

/** Upload ceiling. A 10-minute 1080p MP4 is typically 150–400 MB. */
export const MAX_UPLOAD_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? 512 * 1024 * 1024);

/**
 * The only things an admin may upload. The extension comes from THIS table,
 * never from the uploaded filename — that is what keeps `evil.html` (or
 * `../../app.js`) from ever existing in the media directory.
 */
const ALLOWED: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

export function extensionFor(mime: string): string | null {
  return ALLOWED[(mime || "").toLowerCase().split(";")[0]!.trim()] ?? null;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const hit = Object.entries(ALLOWED).find(([, e]) => e === ext);
  return hit ? hit[0] : "application/octet-stream";
}

/** Is this a name we could have generated? Blocks traversal and odd inputs. */
export function isSafeMediaName(name: string): boolean {
  return /^[A-Za-z0-9_-]{6,64}\.[a-z0-9]{2,5}$/.test(name);
}

export function newMediaName(mime: string): string | null {
  const ext = extensionFor(mime);
  if (!ext) return null;
  return `${randomUUID().replace(/-/g, "")}.${ext}`;
}

export function mediaPath(name: string): string {
  // Re-resolve and confirm containment: belt and braces on top of the name test.
  const p = resolve(join(MEDIA_DIR, name));
  if (!p.startsWith(MEDIA_DIR)) {
    throw new Error("Refusing to touch a path outside the media directory.");
  }
  return p;
}

/** Public URL for an uploaded file. */
export function mediaUrl(name: string): string {
  return `${MEDIA_BASE_URL}/${name}`;
}

export function mediaExists(name: string): boolean {
  return isSafeMediaName(name) && existsSync(mediaPath(name));
}

export function deleteMedia(name: string): boolean {
  if (!mediaExists(name)) return false;
  try {
    unlinkSync(mediaPath(name));
    return true;
  } catch {
    return false;
  }
}

export function listMedia(): Array<{ name: string; size: number; modified: number; url: string; type: string }> {
  try {
    return readdirSync(MEDIA_DIR)
      .filter(isSafeMediaName)
      .map((name) => {
        const s = statSync(mediaPath(name));
        return {
          name,
          size: s.size,
          modified: s.mtimeMs,
          url: mediaUrl(name),
          type: contentTypeFor(name)
        };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return [];
  }
}
