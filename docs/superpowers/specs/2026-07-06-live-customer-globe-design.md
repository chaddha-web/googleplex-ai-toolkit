# Live Customer Globe — admin ops view

**Date:** 2026-07-06
**Status:** Approved (admin placement · both layers · geoip-lite offline)

## Problem

The admin has no spatial view of where customers are. We want a live 3D globe
showing customer locations at **country/state granularity only** — never
precise positions, IPs, or identities.

## Decisions (from brainstorming)

- **Placement:** admin panel only — new page `/app/admin/globe`, linked from the
  admin home tool row.
- **Layers:** both —
  - *Customers* (dim dots): every registered account, by self-reported
    `users.country`, plotted at country centroids, sized by count.
  - *Active now* (bright pulsing rings): users with a live session, geo-located
    from the session IP to country + state.
- **Geo source:** `geoip-lite` — offline IP→country/region/ll lookup on the
  server. No API keys, no external calls; IPs never leave the VPS.
  Fallback if its ~135 MB RSS pinches the VPS: `fast-geoip` (same shape,
  disk-backed, low memory).

## Backend — `GET /auth/admin/geo` (services/auth, new routes/geo.ts)

Guarded by the existing admin check (Bearer → verifyAccessToken → role==='admin').

Response:

```json
{
  "customers": [{ "country": "India", "count": 12 }],
  "active":    [{ "country": "IN", "region": "UP", "lat": 28, "lng": 77, "count": 3 }],
  "totals":    { "customers": 14, "active": 4 }
}
```

- *customers*: `SELECT country, COUNT(*) FROM users WHERE country IS NOT NULL GROUP BY country`.
- *active*: live refresh tokens (`revoked_at IS NULL AND expires_at > now`),
  deduped to one row per user (latest), `geoip.lookup(ip)` →
  aggregate by `country|region|roundedLat|roundedLng`.
- **Privacy by construction:** counts only; no IP, id, or email in the
  response; lat/lng rounded to integer degrees (~100 km). Lookup failures
  (private/unknown IPs) are silently skipped.

## Frontend — `apps/landing/app/app/admin/globe/page.tsx`

- `react-globe.gl` (+ `three`), loaded with `next/dynamic` `ssr:false` so the
  heavy bundle stays on this page only.
- Night-earth texture committed to `apps/landing/public/globe/earth-night.jpg`
  (self-hosted; no runtime CDN dependency).
- Dim gold points: customers per country via a small static country→centroid
  table (onboarding offers ~16 countries; unknown/"Other" skipped).
- Bright emerald points + animated rings: active clusters; hover label
  `"<region>, <country> — N online"`. Country code → display name via
  `Intl.DisplayNames`; region shown as its ISO code.
- Auto-rotate; poll the endpoint every 30 s; pulsing LIVE badge + totals in
  the header. Client-side admin guard (bounce non-admins to /app) as on other
  admin pages.

## Sources

- react-globe.gl — https://github.com/vasturiano/react-globe.gl (points/rings/labels; maintained)
- rejected: cobe — no per-point labels/tooltips (marketing-style dot matrix)
- geoip-lite — https://www.npmjs.com/package/geoip-lite (offline MaxMind data, bundled)
- fallback: fast-geoip — https://github.com/onramper/fast-geoip (low-memory variant)
- texture: three-globe example asset (earth-night.jpg), committed into the repo

## Testing

- geoip sanity: known public IP (8.8.8.8) resolves to US.
- Endpoint shape: customers/active/totals arrays present; counts numeric.
- No-PII assertion: serialized response contains no `ip`, `email`, or user-id
  fields.
- Typecheck auth + landing.

## Out of scope

- Member/landing-facing globes.
- Historical playback or analytics; this is a live snapshot only.
- City-level precision (deliberately excluded for privacy).
