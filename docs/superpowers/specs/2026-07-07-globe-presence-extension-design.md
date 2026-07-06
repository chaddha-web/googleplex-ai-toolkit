# Globe presence extension — design

**Status:** approved (design), pending implementation plan
**Date:** 2026-07-07
**Builds on:** `2026-07-06-live-customer-globe-design.md` and the shipped globe
(`edd0cb9`), its visibility fix (`697a417`), and geo-lookup hardening (`cfd94b3`).
**Vault:** see `[[Live Customer Globe]]` for the feature's known-gaps context.

## Goal

Two additions to the admin globe, both preserving the existing privacy posture
(offline `geoip-lite`, aggregate-only, ~100 km rounding, IPs never stored or
returned):

1. **Members — "where they are from" (both-layers placement).** Place every
   member on the globe: precise from their latest session IP when we have one,
   otherwise fall back to their self-reported country centroid. Fixes the
   current gaps where members outside the hardcoded 16 countries (or "Other")
   are counted but never drawn, and where the "members worldwide" total exceeds
   the plotted dots.
2. **Anonymous "viewing now" layer.** Show people currently on the public pages
   (landing / signup / login), logged-in or not, as a distinct third layer with
   a live counter.

## Non-goals

- No street/city precision (kept at ~100 km by design).
- No persistence of presence (ephemeral, in-memory).
- No subdivision-name humanisation of region codes (labels stay country-level;
  noted as a follow-up — needs a subdivision dataset).
- No presence on the authenticated `/app/*` area (those users are the "online"
  layer already).

## Part A — server-side member placement

Move all placement into the endpoint so the client just plots
`{lat, lng, count, label}`. This deletes the client's `COUNTRY_LL` table and
`Intl` region logic.

**New query** (auth `db.ts`) — latest IP per user across all sessions:
```sql
SELECT user_id, ip, MAX(created_at) AS mx
  FROM refresh_tokens
 WHERE ip IS NOT NULL
 GROUP BY user_id
```
(SQLite returns the `ip` from the MAX(created_at) row.)

**Placement per member:**
1. Has a latest IP → `lookupGeo(ip)` (the shared helper from `cfd94b3`) →
   rounded `lat/lng`, `region`, `country`. Label = country name (region code
   appended as a hint when present).
2. No IP → self-reported country in the server-side `CENTROIDS` map (the 16
   onboarding names; "Other" is unplaceable) → centroid, label = country name.
3. Neither (e.g. "Other" + never logged in) → skipped.

Aggregate by rounded coords into `members: [{lat, lng, count, label}]`.
`totals.members` = **placed** members (not `users.length`), so total == plotted.

## Part B — anonymous presence ("viewing now")

**New module** `services/auth/src/presence.ts`:
- In-memory `Map<vid, { country, region, lat, lng, last }>`. **The IP is used
  only transiently for the geoip lookup and never stored.**
- `TTL = 60_000 ms`; `MAX ≈ 20_000` entries (size-capped; evict oldest on
  overflow) so it can't be used to exhaust memory.
- `recordPresence(vid, ip)` — `lookupGeo` → store rounded coords + `last = now`.
- `activeViewers()` — drop entries older than TTL (lazy sweep on read),
  aggregate by rounded coords → `[{lat, lng, region, country, count}]` + total.

**New route** `POST /auth/presence/ping` (public, unauthenticated):
- Body `{ vid: string }`. Reject if `vid` isn't a UUID. Tiny body limit.
- Per-IP rate-limited (heartbeat is ~2.4/min; allow ~30/min).
- `recordPresence(vid, req.ip)` → `204`. `req.ip` is real via `trustProxy`.

**Client beacon** `apps/landing/components/presence-beacon.tsx`, mounted once in
`apps/landing/app/layout.tsx` (root):
- Skip entirely when `usePathname()` starts with `/app` (authed area).
- `vid` = `sessionStorage` UUID (minted once; no cookie → no consent-banner
  impact, no cross-session tracking).
- Ping on mount, then every 25 s **while `document.visibilityState === 'visible'`**;
  `navigator.sendBeacon` a final ping on `pagehide`.

## Endpoint response shape (new)

```jsonc
{
  "members": [{ "lat", "lng", "count", "label" }], // placed: IP-precise or country fallback
  "online":  [{ "lat", "lng", "count", "label" }], // renamed from "active"
  "viewers": [{ "lat", "lng", "count", "label" }], // anonymous live visitors
  "totals":  { "members", "online", "viewers" }
}
```
Client and server deploy together; a single failed 30 s poll during rollout
self-recovers (admin page only).

## Client (admin-globe.tsx) changes

- Plot three layers: members (gold), online (emerald + rings), **viewers (cyan +
  subtle ripple)**. Labels come from the server.
- Overlay gains a **"viewing now"** counter and a legend row.
- Camera auto-frame (already shipped) now spans members + online + viewers.
- Keep the shipped polish (hidden-tab pause, stable rings).

## Privacy & abuse posture

- Unchanged guarantees: offline lookups, aggregate-only, ~100 km rounding, no
  IPs/ids returned; presence stores **no IP** at all.
- `/auth/presence/ping` is intentionally public but rate-limited, size-capped,
  UUID-validated, and TTL-swept — bounded memory, can't wildly inflate counts.
- Overlap is expected and intended: a logged-in member sitting on a public page
  appears in both "online" and "viewing now" — label it, don't dedupe.

## Testing

- `presence.ts` unit: record → appears; expires after TTL; aggregates by cell;
  size cap evicts.
- Member placement unit: has-IP → geoip path; no-IP → centroid; "Other"+no-IP →
  skipped; `totals.members` == placed count.
- `lookupGeo` unit: `::ffff:` normalisation; bad IP → null (no throw).
- Manual: open landing → "viewing now" ticks up on the globe; close tab →
  drops ~60 s later; members appear for non-16 countries via IP.

## Rollout

Single deploy (auth + landing rebuild). No migration — presence is in-memory;
the new member query reads existing `refresh_tokens`. No data changes.
