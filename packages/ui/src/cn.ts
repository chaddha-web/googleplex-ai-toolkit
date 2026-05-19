// Tiny classname merger — drops falsy, joins with spaces, dedupes runs of whitespace.
// Avoids pulling clsx + tailwind-merge as deps; precedence collisions are rare in our
// primitive set, but if needed swap in `tailwind-merge` later.
export function cn(...inputs: Array<string | undefined | null | false | 0>): string {
  return inputs.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
