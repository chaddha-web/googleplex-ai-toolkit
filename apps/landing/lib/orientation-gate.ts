import { fetchOrientation } from "@/lib/auth-client";

/**
 * Whether the signed-in member still owes the orientation, memoised for the
 * tab's lifetime so we don't re-ask on every navigation inside /app.
 *
 * It only ever flips from "needed" to "not needed". A failed lookup resolves to
 * false: a flaky auth service must never lock a member out of their own
 * dashboard, and the worst case is they see the orientation on their next visit.
 */

let required: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

export function checkOrientation(): Promise<boolean> {
  if (required !== null) return Promise.resolve(required);
  if (!inFlight) {
    inFlight = fetchOrientation()
      .then((o) => {
        required = !!o?.required;
        return required;
      })
      .catch(() => false)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Called once the member is through, so the gate stops firing. */
export function clearOrientationGate(): void {
  required = false;
}

/** Force a re-check (used after an admin resets someone's orientation). */
export function resetOrientationGate(): void {
  required = null;
}
