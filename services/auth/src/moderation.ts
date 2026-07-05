/**
 * Lightweight, dependency-free comment moderation for the Circle.
 *
 * Goal: stop obvious public abuse (slurs, harassment, crude profanity) at the
 * moment of posting, so it never reaches the feed. It is intentionally simple
 * and easy to tune — the admin's manual hide/pin handles anything subtler.
 *
 * Matching strategy (keeps false positives low while catching common evasion):
 *   1. Normalize leetspeak → letters (a$$ → ass, sh1t → shit).
 *   2. WORD-BOUNDARY match on the space-preserved text for EVERY term. This
 *      avoids the "Scunthorpe problem" (innocent words that contain a bad
 *      substring — "classic", "cockpit", "assassin") while still catching
 *      standalone evasions like "a$$".
 *   3. COLLAPSED substring match (all separators removed) for the subset of
 *      terms that are safe as substrings, so spaced-out evasion ("f u c k")
 *      is caught. Short/ambiguous words (ass, cock, dick) are deliberately
 *      NOT collapse-matched.
 *
 * Edit the wordlists below to tune. Nothing else needs to change.
 */

// Every blocked term. `collapse: true` also substring-matches the collapsed
// (letters-only) text — only set it for terms that never appear inside an
// innocent word.
type Term = { word: string; collapse: boolean };

const BLOCKLIST: Term[] = [
  // Crude profanity — collapse-safe (never inside an innocent English word)
  { word: "fuck", collapse: true },
  { word: "motherfucker", collapse: true },
  { word: "shit", collapse: true },
  { word: "bitch", collapse: true },
  { word: "slut", collapse: true },
  { word: "asshole", collapse: true },
  { word: "dickhead", collapse: true },
  { word: "wanker", collapse: true },
  { word: "twat", collapse: true },
  // Short / substring-risky — word-boundary only (else "classic", "cockpit",
  // "Scunthorpe", "pussycat", "bastardization" would false-positive)
  { word: "ass", collapse: false },
  { word: "cock", collapse: false },
  { word: "dick", collapse: false },
  { word: "cunt", collapse: false },
  { word: "whore", collapse: false },
  { word: "pussy", collapse: false },
  { word: "bastard", collapse: false },
  // Severe: slurs, harassment, threats
  { word: "nigger", collapse: true },
  { word: "nigga", collapse: true },
  { word: "faggot", collapse: true },
  { word: "tranny", collapse: true },
  { word: "kike", collapse: true },
  { word: "killyourself", collapse: true },
  { word: "kys", collapse: true },
  // Severe but substring-risky (retardant, raccoon, suspicious, Pakistan) —
  // word-boundary only
  { word: "retard", collapse: false },
  { word: "chink", collapse: false },
  { word: "spic", collapse: false },
  { word: "paki", collapse: false },
  { word: "coon", collapse: false }
];

/** Lowercase + fold common leetspeak substitutions to letters. */
function foldLeet(input: string): string {
  return input
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[$5]/g, "s")
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/7/g, "t")
    .replace(/8/g, "b");
}

/** Space-preserved, collapsed-whitespace form for word-boundary matching. */
function spacedForm(input: string): string {
  return foldLeet(input).replace(/[\s._\-*+/\\]+/g, " ").trim();
}

/** Letters-only form (all separators/digits stripped) for substring matching. */
function collapsedForm(input: string): string {
  return foldLeet(input).replace(/[^a-z]/g, "");
}

function wordBoundaryHit(spaced: string, term: string): boolean {
  // term is already lowercase letters; build a \bterm\b matcher.
  const re = new RegExp(`\\b${term}\\b`, "i");
  return re.test(spaced);
}

/**
 * True if the text contains disallowed content.
 * Empty / whitespace-only is not abusive (length is validated elsewhere).
 */
export function isAbusive(text: string): boolean {
  if (!text) return false;
  const spaced = spacedForm(text);
  const collapsed = collapsedForm(text);

  for (const { word, collapse } of BLOCKLIST) {
    if (wordBoundaryHit(spaced, word)) return true;
    if (collapse && collapsed.includes(word)) return true;
  }
  return false;
}

export const ABUSE_MESSAGE = "Let's keep it respectful — please rephrase.";
