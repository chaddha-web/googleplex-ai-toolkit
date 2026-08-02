/**
 * Orientation config + media safety tests.
 *
 *   npx tsx src/onboarding.test.ts
 *
 * Focused on the two things that bite if they're wrong:
 *   1. the media name/extension rules (an admin upload lands on a domain that
 *      serves our cookies, so the extension must never come from the client),
 *   2. the settings parsing that decides whether a member is gated at all —
 *      a corrupt or missing value must fail OPEN to "off", never trap members
 *      behind an orientation the admin didn't configure.
 *
 * Runs against a scratch SQLite file so it never touches a real auth.db.
 */

import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "gplex-onb-test-"));
process.env.AUTH_DB_PATH = join(dir, "auth.db");
process.env.MEDIA_DIR = join(dir, "media");

const { stmts } = await import("./db.js");
const { onboardingConfig, dashboardTheme, writeSetting, DEFAULT_THEME } = await import("./config.js");
const { isSafeMediaName, extensionFor, newMediaName, contentTypeFor } = await import("./media.js");

// ── Media naming ───────────────────────────────────────────────────────────
assert.equal(extensionFor("video/mp4"), "mp4");
assert.equal(extensionFor("VIDEO/MP4"), "mp4", "content type match is case-insensitive");
assert.equal(extensionFor("video/mp4; codecs=avc1"), "mp4", "parameters are ignored");
assert.equal(extensionFor("text/html"), null, "HTML is never accepted");
assert.equal(extensionFor("application/javascript"), null, "scripts are never accepted");
assert.equal(newMediaName("text/html"), null, "no name is generated for a rejected type");

assert.match(newMediaName("video/mp4")!, /^[0-9a-f]{32}\.mp4$/, "name is ours, not the client's");
assert.notEqual(newMediaName("image/png"), newMediaName("image/png"), "names are unique");

assert.equal(isSafeMediaName("../../etc/passwd"), false, "traversal rejected");
assert.equal(isSafeMediaName("foo/bar.mp4"), false, "path separators rejected");
assert.equal(isSafeMediaName("evil.mp4.html"), false, "double extension rejected");
assert.equal(isSafeMediaName("short.mp4"), false, "too short to be one of ours");
assert.equal(isSafeMediaName("abc123def456.mp4"), true);
assert.equal(contentTypeFor("abc123def456.mp4"), "video/mp4");
assert.equal(contentTypeFor("abc123def456.xyz"), "application/octet-stream", "unknown ext is inert");

// ── Orientation config ─────────────────────────────────────────────────────
// Nothing configured: gating must be OFF so no member is ever stuck behind an
// orientation that was never set up.
{
  const c = onboardingConfig();
  assert.equal(c.gating, "off", "unconfigured means ungated");
  assert.equal(c.video, null);
  assert.equal(c.maxAttempts, 0, "0 = unlimited");
}

writeSetting("onboarding.gating", "pass");
writeSetting("onboarding.pass_mark", "80");
writeSetting("onboarding.max_attempts", "3");
{
  const c = onboardingConfig();
  assert.equal(c.gating, "pass");
  assert.equal(c.passMark, 80);
  assert.equal(c.maxAttempts, 3);
}

// Garbage in the store must not throw or produce a nonsense gate.
writeSetting("onboarding.gating", "banana");
assert.equal(onboardingConfig().gating, "off", "an unknown gating value falls back to off");
writeSetting("onboarding.gating", "pass");

writeSetting("onboarding.pass_mark", "not-a-number");
assert.equal(onboardingConfig().passMark, 70, "a bad pass mark falls back to the default");
writeSetting("onboarding.pass_mark", "500");
assert.equal(onboardingConfig().passMark, 100, "pass mark is clamped to 100");

writeSetting("onboarding.video", "{ not json");
assert.equal(onboardingConfig().video, null, "corrupt video JSON is ignored, not fatal");
writeSetting("onboarding.video", JSON.stringify({ kind: "url", src: "  ", title: "x" }));
assert.equal(onboardingConfig().video, null, "a blank src is no video");
writeSetting("onboarding.video", JSON.stringify({ kind: "url", src: "https://e.com/v.mp4", title: "Welcome" }));
assert.deepEqual(onboardingConfig().video, { kind: "url", src: "https://e.com/v.mp4", title: "Welcome" });

// ── Theme ──────────────────────────────────────────────────────────────────
assert.deepEqual(dashboardTheme(), DEFAULT_THEME, "unset theme is the default");

writeSetting("theme.dashboard", JSON.stringify({ kind: "gradient", colors: ["#000"], angle: 999 }));
{
  const t = dashboardTheme();
  assert.deepEqual(t.colors, DEFAULT_THEME.colors, "a one-colour gradient falls back");
  assert.equal(t.angle, 360, "angle is clamped");
}
writeSetting("theme.dashboard", JSON.stringify({ kind: "wormhole" }));
assert.equal(dashboardTheme().kind, "default", "an unknown kind falls back to default");

// ── Questions ──────────────────────────────────────────────────────────────
const now = Date.now();
const q = (id: string, order: number, active: number) =>
  stmts.onboarding.insertQuestion.run({
    id,
    prompt: `Question ${id}`,
    options_json: JSON.stringify(["a", "b"]),
    correct_index: 0,
    required: 1,
    sort_order: order,
    active,
    created_at: now,
    updated_at: now
  });

q("q1", 2, 1);
q("q2", 1, 1);
q("q3", 3, 0); // inactive

const active = stmts.onboarding.activeQuestions.all();
assert.equal(active.length, 2, "inactive questions are not served to members");
assert.deepEqual(
  active.map((r) => r.id),
  ["q2", "q1"],
  "questions come back in the admin's order"
);
assert.equal(stmts.onboarding.maxSort.get()?.n, 3, "next question sorts after every existing one");
assert.equal(stmts.onboarding.allQuestions.all().length, 3, "admin sees inactive ones too");
assert.equal(stmts.onboarding.completions.all().length, 0, "nobody has attempted it yet");

try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* Windows holds the SQLite handle until exit; the OS reclaims it */
}
console.log("✓ onboarding + media safety tests passed");
