import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import type { DispatcherMap } from "../factory.js";

// REQ-AD2 hosting controller. This handler is the closest to its production
// shape because the AI-hosting wildcard trick (PRD §7.4) only needs filesystem
// ops — takedown moves a directory; reinstate moves it back.

const SITES_ROOT = process.env.USER_SITES_ROOT ?? "/var/www/user-sites";
const QUARANTINE_ROOT = process.env.USER_SITES_QUARANTINE ?? "/var/www/user-sites-quarantine";

function safeSubdomain(name: string): string {
  // Subdomain label: only [a-z0-9-], 1-63 chars.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
    throw new Error(`invalid subdomain: ${name}`);
  }
  return name;
}

async function moveDir(from: string, to: string): Promise<boolean> {
  try {
    await fs.mkdir(resolve(to, ".."), { recursive: true });
    await fs.rename(from, to);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

export const hostingDispatchers: DispatcherMap = {
  "hosting.takedown": async (a) => {
    const sub = safeSubdomain(a.subdomain);
    const src = join(SITES_ROOT, sub);
    const dst = join(QUARANTINE_ROOT, sub + "." + Date.now());
    const moved = await moveDir(src, dst);
    if (!moved) return { ok: false, error: `subdomain not found: ${sub}` };
    console.warn(`[hosting] takedown ${sub} (reason: ${a.reason}) → ${dst}`);
    return { ok: true, result: { quarantinedAt: dst } };
  },
  "hosting.reinstate": async (a) => {
    const sub = safeSubdomain(a.subdomain);
    // Find the most recent quarantine bucket for this subdomain.
    let entries: string[] = [];
    try {
      entries = await fs.readdir(QUARANTINE_ROOT);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, error: "quarantine dir missing" };
      throw e;
    }
    const candidates = entries
      .filter((e) => e.startsWith(sub + "."))
      .sort()
      .reverse();
    if (candidates.length === 0) return { ok: false, error: `no quarantined version of ${sub}` };
    const latest = join(QUARANTINE_ROOT, candidates[0]!);
    const dst = join(SITES_ROOT, sub);
    await moveDir(latest, dst);
    console.warn(`[hosting] reinstate ${sub} from ${latest}`);
    return { ok: true, result: { restoredFrom: latest } };
  },
  "hosting.setTier": async (a) => {
    console.warn(`[hosting] STUB setTier project=${a.projectId} tier=${a.tier}`);
    return { ok: true, result: { projectId: a.projectId, tier: a.tier } };
  }
};
