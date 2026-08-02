/**
 * Notification topic tests.
 *
 *   npx tsx src/notify-topics.test.ts
 *
 * The one rule worth testing: a sub-admin can never end up subscribed to a
 * founder-only topic. Settings changes, admin promotions and system health tell
 * you how the platform is run, so the cap has to hold no matter what is sent or
 * what is already sitting in the database.
 */

import assert from "node:assert";
import {
  SUBADMIN_TOPICS,
  TOPICS,
  allowedTopics,
  clampTopics,
  isTopic,
  parseTopics,
  serializeTopics
} from "./notify-topics.js";

// ── Shape ──────────────────────────────────────────────────────────────────
assert.ok(TOPICS.includes("signup"));
assert.ok(TOPICS.includes("login"));
assert.ok(TOPICS.includes("withdrawal"));
assert.deepEqual(SUBADMIN_TOPICS, ["signup", "login", "withdrawal"], "the agreed sub-admin set");

assert.equal(isTopic("signup"), true);
assert.equal(isTopic("banana"), false);
assert.equal(isTopic(null), false);
assert.equal(isTopic(42), false);

// ── Allowance ──────────────────────────────────────────────────────────────
assert.equal(allowedTopics(true).length, TOPICS.length, "founder may receive everything");
assert.deepEqual(allowedTopics(false), SUBADMIN_TOPICS, "sub-admin is limited to the three");

// ── The cap ────────────────────────────────────────────────────────────────
{
  // A sub-admin asking for the lot gets only the three.
  const got = clampTopics([...TOPICS], false);
  assert.deepEqual(got.sort(), [...SUBADMIN_TOPICS].sort(), "founder-only topics are stripped");
}
{
  // Explicitly asking for the sensitive ones yields nothing.
  assert.deepEqual(clampTopics(["settings", "admin", "system", "money"], false), []);
}
{
  // The founder keeps them.
  const got = clampTopics(["settings", "admin", "system"], true);
  assert.deepEqual(got.sort(), ["admin", "settings", "system"]);
}
{
  // Junk in, nothing out — no crash, no pass-through.
  assert.deepEqual(clampTopics(["nope", 7, null, undefined, {}], true), []);
  assert.deepEqual(clampTopics("not-an-array", true), []);
  assert.deepEqual(clampTopics(null, true), []);
}
{
  // Duplicates collapse.
  assert.deepEqual(clampTopics(["signup", "signup", "signup"], false), ["signup"]);
}

// ── Stored rows are re-clamped, not trusted ────────────────────────────────
{
  // The case that matters: someone was founder, subscribed to everything, then
  // was demoted. Their stored row still lists founder-only topics.
  const stored = serializeTopics([...TOPICS]);
  const asFounder = clampTopics(parseTopics(stored), true);
  const asSubAdmin = clampTopics(parseTopics(stored), false);
  assert.equal(asFounder.length, TOPICS.length, "still everything while founder");
  assert.deepEqual(
    asSubAdmin.sort(),
    [...SUBADMIN_TOPICS].sort(),
    "demotion narrows an existing subscription without needing a rewrite"
  );
}
{
  // A hand-edited / corrupt row must not throw or leak.
  assert.deepEqual(parseTopics("{ not json"), []);
  assert.deepEqual(parseTopics(null), []);
  assert.deepEqual(parseTopics('"a string"'), []);
  assert.deepEqual(parseTopics('["settings","garbage"]'), ["settings"]);
  assert.deepEqual(clampTopics(parseTopics('["settings","garbage"]'), false), []);
}

// ── Round trip ─────────────────────────────────────────────────────────────
assert.deepEqual(parseTopics(serializeTopics(["signup", "withdrawal"])), ["signup", "withdrawal"]);

console.log("✓ notification topic tests passed");
