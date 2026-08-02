"use client";

import { AUTH_BASE, authedFetch } from "@/lib/auth-client";

/**
 * Does this member still owe the orientation?
 *
 * The orientation and the setup flow live on the LANDING app; this app is the
 * product dashboard on another subdomain. Both are reachable with the same
 * session (the refresh cookie is scoped to *.ggakingclub.com), so gating only
 * one of them gates nothing — a member who lands here directly would walk past
 * the video, the quiz and the $1 entirely. That is exactly what happened before
 * this existed.
 *
 * Memoised for the tab's lifetime and only ever flips from "owed" to "not
 * owed". A failed lookup resolves to false: a flaky auth service must never
 * bounce a paying member out of their own dashboard.
 */

let required: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

export function checkOrientation(): Promise<boolean> {
  if (required !== null) return Promise.resolve(required);
  if (!inFlight) {
    inFlight = authedFetch(`${AUTH_BASE}/auth/onboarding`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { required?: boolean } | null) => {
        required = !!d?.required;
        return required;
      })
      .catch(() => false)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function clearOrientationGate(): void {
  required = false;
}
