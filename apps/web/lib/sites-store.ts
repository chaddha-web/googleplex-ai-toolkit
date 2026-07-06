import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Published-store storage for GoogolPlex Studio.
 *
 * Two sources, checked in order:
 *  1. PUBLISHED dir  — sites the Studio actually generated + published at runtime
 *                      (.published-sites/<slug>.html, gitignored, writable).
 *  2. DEMO dir       — hand-built showcase sites committed to the repo
 *                      (demo-sites/<slug>.html) used for the demo / when no AI
 *                      key is configured.
 *
 * Everything is path-based and self-contained (one HTML file per slug), so a
 * published store is served live at /store/<slug> with zero infra.
 */

// The web app runs with cwd = apps/web in dev and = repo root in some setups.
// Resolve both candidates so it works either way.
function resolveDir(rel: string): string {
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(process.cwd(), "apps", "web", rel)
  ];
  for (const c of candidates) {
    if (existsSync(path.dirname(c)) || existsSync(c)) return c;
  }
  return candidates[0]!;
}

const DEMO_DIR = resolveDir("demo-sites");
// PUBLISHED_SITES_DIR points at a persisted volume in prod so member-generated
// sites survive a redeploy. Falls back to a repo-relative dir in dev.
const PUBLISHED_DIR = process.env.PUBLISHED_SITES_DIR || resolveDir(".published-sites");

/** Lowercase a-z, 0-9 and single hyphens; 1–63 chars. Returns null if invalid. */
export function sanitizeSlug(input: string): string | null {
  const s = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return null;
  return s;
}

/** Read a published or demo site's HTML by slug, or null if not found. */
export async function readSite(slug: string): Promise<string | null> {
  const safe = sanitizeSlug(slug);
  if (!safe) return null;
  for (const dir of [PUBLISHED_DIR, DEMO_DIR]) {
    const file = path.join(dir, `${safe}.html`);
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      /* try next source */
    }
  }
  return null;
}

/** Persist a generated site's HTML under its slug. Returns the live path. */
export async function publishSite(slug: string, html: string): Promise<string> {
  const safe = sanitizeSlug(slug);
  if (!safe) throw new Error("invalid slug");
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
  await fs.writeFile(path.join(PUBLISHED_DIR, `${safe}.html`), html, "utf8");
  return `/store/${safe}`;
}

/** Does a site already exist for this slug (published or demo)? */
export async function siteExists(slug: string): Promise<boolean> {
  return (await readSite(slug)) !== null;
}
