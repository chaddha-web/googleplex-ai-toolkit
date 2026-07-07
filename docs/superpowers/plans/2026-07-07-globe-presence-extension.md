# Globe Presence Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place every member on the admin globe from their real location (IP, else country centroid) and add a live anonymous "viewing now" layer from public-page visitors.

**Architecture:** All placement + aggregation moves server-side into the auth service's `/auth/admin/geo` (returns ready-to-plot `{lat,lng,count,label}`). A new in-memory presence store + public `POST /auth/presence/ping` feed the viewers layer; a client beacon in the landing root layout pings while a public tab is visible. The admin globe consumes the new `{members, online, viewers, totals}` shape and drops its hardcoded country table.

**Tech Stack:** Fastify + better-sqlite3 (auth), geoip-lite (offline), Next 14 client (react-globe.gl), Node `Intl.DisplayNames` for country names.

**Spec:** `docs/superpowers/specs/2026-07-07-globe-presence-extension-design.md`

---

### Task 0: Extract `lookupGeo` into a dependency-free module

`lookupGeo` currently lives in `geo.ts`, which imports `db.ts` (opens SQLite at
import time). `presence.ts` needs `lookupGeo` but must not pull in the DB (keeps
its unit test pure). Move it out.

**Files:**
- Create: `services/auth/src/geoip.ts`
- Modify: `services/auth/src/routes/geo.ts` (drop the local def, import instead)

- [ ] **Step 1: Create `services/auth/src/geoip.ts`**

```ts
// services/auth/src/geoip.ts — offline IP→geo, no DB dependency.
import geoip from "geoip-lite";

/** Normalises IPv4-mapped IPv6 ("::ffff:a.b.c.d") and never throws. */
export function lookupGeo(
  ip: string | null | undefined
): ReturnType<typeof geoip.lookup> {
  if (!ip) return null;
  const norm = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  try { return geoip.lookup(norm); } catch { return null; }
}
```

- [ ] **Step 2: In `geo.ts`**, delete the local `lookupGeo` function and its
`import geoip from "geoip-lite"` (Task 3 rewrites this file anyway), and import
`import { lookupGeo } from "../geoip.js";`. Keep a re-export for back-compat:
`export { lookupGeo } from "../geoip.js";`

- [ ] **Step 3: Typecheck** — `cd services/auth && npx tsc --noEmit -p tsconfig.json` → no errors.

- [ ] **Step 4: Commit**

```bash
git add services/auth/src/geoip.ts services/auth/src/routes/geo.ts
git commit -m "refactor(auth): extract lookupGeo into db-free geoip module"
```

---

### Task 1: Presence store module

**Files:**
- Create: `services/auth/src/presence.ts`
- Test: `services/auth/src/presence.test.ts`

- [ ] **Step 1: Write the presence module**

```ts
// services/auth/src/presence.ts
import { lookupGeo } from "./geoip.js";

type Entry = { country: string; region: string; lat: number; lng: number; last: number };

const TTL_MS = 60_000;
const MAX = 20_000;
const store = new Map<string, Entry>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVid(vid: unknown): vid is string {
  return typeof vid === "string" && UUID_RE.test(vid);
}

/** Record a heartbeat. The IP is used only for the offline geoip lookup and is
 *  never stored — only country/region/rounded coords + a timestamp. */
export function recordPresence(vid: string, ip: string | null | undefined, now = Date.now()): void {
  const hit = lookupGeo(ip);
  if (!hit || !hit.ll) return; // unlocatable — ignore
  if (!store.has(vid) && store.size >= MAX) {
    // Bounded memory: evict the oldest entry on overflow.
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, v] of store) if (v.last < oldest) { oldest = v.last; oldestKey = k; }
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(vid, {
    country: hit.country,
    region: hit.region || "",
    lat: Math.round(hit.ll[0]),
    lng: Math.round(hit.ll[1]),
    last: now
  });
}

export type ViewerCluster = {
  country: string; region: string; lat: number; lng: number; count: number;
};

/** Live viewers, aggregated by rounded cell. Sweeps expired entries on read. */
export function activeViewers(now = Date.now()): { clusters: ViewerCluster[]; total: number } {
  const clusters = new Map<string, ViewerCluster>();
  let total = 0;
  for (const [k, v] of store) {
    if (now - v.last > TTL_MS) { store.delete(k); continue; }
    total++;
    const key = `${v.country}|${v.region}|${v.lat}|${v.lng}`;
    const cur = clusters.get(key);
    if (cur) cur.count++;
    else clusters.set(key, { country: v.country, region: v.region, lat: v.lat, lng: v.lng, count: 1 });
  }
  return { clusters: [...clusters.values()], total };
}

// Test-only reset.
export function _resetPresence(): void { store.clear(); }
```

- [ ] **Step 2: Write a verification test**

```ts
// services/auth/src/presence.test.ts
import assert from "node:assert";
import { recordPresence, activeViewers, isValidVid, _resetPresence } from "./presence.js";

// A public IP geoip-lite resolves (Google DNS geolocates to the US).
const IP = "8.8.8.8";
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

_resetPresence();
assert.equal(isValidVid("not-a-uuid"), false);
assert.equal(isValidVid(vid(1)), true);

const t = 1_000_000;
recordPresence(vid(1), IP, t);
recordPresence(vid(2), IP, t);            // same cell -> count 2
let r = activeViewers(t);
assert.equal(r.total, 2, "two live viewers");
assert.equal(r.clusters.length, 1, "same cell merges");
assert.equal(r.clusters[0].count, 2);

// Expiry: 61s later with no new ping -> gone.
r = activeViewers(t + 61_000);
assert.equal(r.total, 0, "expired after TTL");

// Private IP -> ignored.
_resetPresence();
recordPresence(vid(3), "10.0.0.1", t);
assert.equal(activeViewers(t).total, 0, "private IP ignored");

console.log("presence.test OK");
```

- [ ] **Step 3: Run it (from the service dir so imports resolve)**

Run: `cd services/auth && npx tsx src/presence.test.ts`
Expected: prints `presence.test OK`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add services/auth/src/presence.ts services/auth/src/presence.test.ts
git commit -m "feat(presence): in-memory viewer store (TTL, size cap, no IP stored)"
```

---

### Task 2: Latest-IP-per-user query

**Files:**
- Modify: `services/auth/src/db.ts` (the `refresh:` stmts object, after `listForUser`)

- [ ] **Step 1: Add the prepared statement** inside `stmts.refresh`, right after `listForUser`:

```ts
    // Latest recorded IP per user across ALL sessions (revoked/expired included)
    // — for member placement on the globe. SQLite returns the ip from the
    // MAX(created_at) row.
    latestIpByUser: db.prepare<[], { user_id: string; ip: string | null }>(`
      SELECT user_id, ip, MAX(created_at) AS mx
        FROM refresh_tokens
       WHERE ip IS NOT NULL
       GROUP BY user_id
    `),
```

- [ ] **Step 2: Typecheck**

Run: `cd services/auth && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add services/auth/src/db.ts
git commit -m "feat(auth): latest-ip-per-user query for globe member placement"
```

---

### Task 3: Rewrite the geo endpoint (server-side placement + 3 layers)

**Files:**
- Modify: `services/auth/src/routes/geo.ts`

- [ ] **Step 1: Replace the file body** with server-side placement. Keep the exported `lookupGeo` (Task-1 depends on it). New content:

```ts
import type { FastifyInstance } from "fastify";
import { stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { activeViewers } from "../presence.js";
import { lookupGeo } from "../geoip.js";

export { lookupGeo }; // back-compat for any importer of geo.ts

// Centroids for the countries offered at onboarding ("Other" is unplaceable).
const CENTROIDS: Record<string, [number, number]> = {
  India: [21, 78], "United States": [38, -97], "United Kingdom": [54, -2],
  Canada: [56, -106], Australia: [-25, 134], Singapore: [1.35, 103.8],
  "United Arab Emirates": [24, 54], Germany: [51, 10], France: [46, 2],
  Netherlands: [52.2, 5.3], Brazil: [-10, -52], Mexico: [23, -102],
  Japan: [36, 138], "South Korea": [36, 128], Nigeria: [9, 8],
  "South Africa": [-29, 24]
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  try { return regionNames.of(code) ?? code; } catch { return code; }
}

type Cell = { lat: number; lng: number; count: number; label: string };

/** Merge a point into a rounded-cell aggregate keyed by lat|lng. */
function addCell(map: Map<string, Cell>, lat: number, lng: number, label: string) {
  const key = `${lat}|${lng}`;
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { lat, lng, count: 1, label });
}

export async function geoRoutes(app: FastifyInstance) {
  app.get("/auth/admin/geo", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Missing bearer token." });
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) return reply.code(401).send({ error: "Invalid token." });
    const me = stmts.user.byId.get(claims.sub);
    if (!me || me.role !== "admin") return reply.code(403).send({ error: "Admin only." });

    // Latest IP per user for precise placement.
    const ipRows = stmts.refresh.latestIpByUser.all() as Array<{ user_id: string; ip: string | null }>;
    const ipByUser = new Map<string, string>();
    for (const r of ipRows) if (r.ip) ipByUser.set(r.user_id, r.ip);

    const users = stmts.user.listAll.all() as Array<{ id: string; country: string | null }>;

    // ── Members: IP-precise where possible, else self-reported centroid ──────
    const members = new Map<string, Cell>();
    for (const u of users) {
      const ip = ipByUser.get(u.id);
      const hit = ip ? lookupGeo(ip) : null;
      if (hit && hit.ll) {
        const lat = Math.round(hit.ll[0]), lng = Math.round(hit.ll[1]);
        const label = hit.region ? `${hit.region}, ${countryName(hit.country)}` : countryName(hit.country);
        addCell(members, lat, lng, label);
        continue;
      }
      const c = (u.country ?? "").trim();
      const ll = c && c !== "Other" ? CENTROIDS[c] : undefined;
      if (ll) addCell(members, ll[0], ll[1], c);
      // else: unplaceable (Other + no session IP) — skipped.
    }

    // ── Online: newest active session per user, geo-located ──────────────────
    const rows = stmts.refresh.listAllActive.all(Date.now()) as Array<{ user_id: string; ip: string | null }>;
    const seen = new Set<string>();
    const online = new Map<string, Cell>();
    let onlineTotal = 0;
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      const hit = lookupGeo(r.ip);
      if (!hit || !hit.ll) continue;
      onlineTotal++;
      const lat = Math.round(hit.ll[0]), lng = Math.round(hit.ll[1]);
      const label = hit.region ? `${hit.region}, ${countryName(hit.country)}` : countryName(hit.country);
      addCell(online, lat, lng, label);
    }

    // ── Viewers: anonymous live presence ────────────────────────────────────
    const { clusters, total: viewersTotal } = activeViewers();
    const viewers: Cell[] = clusters.map((v) => ({
      lat: v.lat, lng: v.lng, count: v.count,
      label: v.region ? `${v.region}, ${countryName(v.country)}` : countryName(v.country)
    }));

    const memberCells = [...members.values()];
    return reply.send({
      members: memberCells,
      online: [...online.values()],
      viewers,
      totals: {
        members: memberCells.reduce((s, c) => s + c.count, 0),
        online: onlineTotal,
        viewers: viewersTotal
      }
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd services/auth && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (and `presence.ts` still resolves `lookupGeo`).

- [ ] **Step 3: Commit**

```bash
git add services/auth/src/routes/geo.ts
git commit -m "feat(globe): server-side member placement + online/viewers layers"
```

---

### Task 4: Public presence ping route

**Files:**
- Create: `services/auth/src/routes/presence.ts`
- Modify: `services/auth/src/server.ts` (import + register)

- [ ] **Step 1: Write the route**

```ts
// services/auth/src/routes/presence.ts
import type { FastifyInstance } from "fastify";
import { recordPresence, isValidVid } from "../presence.js";

export async function presenceRoutes(app: FastifyInstance) {
  // Public, unauthenticated heartbeat from public pages. Rate-limited per IP
  // (a 25s beacon is ~2.4/min; 40/min leaves headroom for prefetch/retries).
  app.post(
    "/auth/presence/ping",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = req.body as { vid?: unknown } | undefined;
      if (!body || !isValidVid(body.vid)) return reply.code(400).send({ error: "bad vid" });
      recordPresence(body.vid, req.ip);
      return reply.code(204).send();
    }
  );
}
```

- [ ] **Step 2: Register it** in `services/auth/src/server.ts` — add the import beside the others and register after `geoRoutes`:

```ts
import { presenceRoutes } from "./routes/presence.js";
// ...
await app.register(geoRoutes);
await app.register(presenceRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `cd services/auth && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add services/auth/src/routes/presence.ts services/auth/src/server.ts
git commit -m "feat(presence): public rate-limited /auth/presence/ping"
```

---

### Task 5: Client presence beacon

**Files:**
- Create: `apps/landing/components/presence-beacon.tsx`
- Modify: `apps/landing/app/layout.tsx` (mount it)

- [ ] **Step 1: Write the beacon**

```tsx
// apps/landing/components/presence-beacon.tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AUTH_BASE } from "@/lib/auth-client";

function vid(): string {
  const KEY = "gp_vid";
  let v = sessionStorage.getItem(KEY);
  if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(KEY, v); }
  return v;
}

/** Anonymous "viewing now" heartbeat for public pages. Skips the authed /app
 *  area (those users are the "online" layer). No cookie — sessionStorage only. */
export function PresenceBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith("/app")) return;
    const url = `${AUTH_BASE}/auth/presence/ping`;
    const id = vid();
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vid: id }),
        keepalive: true
      }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 25_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        navigator.sendBeacon?.(url, new Blob([JSON.stringify({ vid: id })], { type: "application/json" }));
      } else ping();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onHide); };
  }, [pathname]);
  return null;
}
```

- [ ] **Step 2: Mount it** in `apps/landing/app/layout.tsx` — import and place inside `<body>`:

```tsx
import { PresenceBeacon } from "@/components/presence-beacon";
// ...
      <body className="bg-black text-white">
        {children}
        <CookieConsent />
        <PresenceBeacon />
      </body>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/landing && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (filter pre-existing `ai-providers`/`openai`).

- [ ] **Step 4: Commit**

```bash
git add apps/landing/components/presence-beacon.tsx apps/landing/app/layout.tsx
git commit -m "feat(presence): anonymous viewing-now beacon on public pages"
```

---

### Task 6: Admin globe — consume the new shape + viewers layer

**Files:**
- Modify: `apps/landing/components/admin-globe.tsx`

- [ ] **Step 1: Replace `GeoResponse`, the point-building, and the overlay.** Drop `COUNTRY_LL` and the client `Intl`/`countryName` (labels now come from the server). The response type becomes:

```ts
type Cell = { lat: number; lng: number; count: number; label: string };
type GeoResponse = {
  members: Cell[];
  online: Cell[];
  viewers: Cell[];
  totals: { members: number; online: number; viewers: number };
};
```

Rebuild `points` from the three server layers (gold members, emerald online, cyan viewers) and `rings` from online **and** viewers; the camera-centroid effect iterates `data.members`/`online`/`viewers` cells directly (they already carry `lat/lng/count`). Add a "viewing now" counter + a cyan legend row. Full replacement:

```tsx
  const points: Pt[] = [];
  if (data) {
    for (const c of data.members) points.push({
      lat: c.lat, lng: c.lng,
      size: Math.min(0.9, 0.3 + Math.sqrt(c.count) * 0.08),
      color: "rgba(255, 200, 90, 0.9)",
      label: `${c.label} — ${c.count} member${c.count === 1 ? "" : "s"}`
    });
    for (const c of data.online) points.push({
      lat: c.lat, lng: c.lng,
      size: Math.min(1.1, 0.45 + Math.sqrt(c.count) * 0.1),
      color: "rgba(52, 211, 153, 0.98)",
      label: `${c.label} — ${c.count} online`
    });
    for (const c of data.viewers) points.push({
      lat: c.lat, lng: c.lng,
      size: Math.min(1.0, 0.4 + Math.sqrt(c.count) * 0.1),
      color: "rgba(34, 211, 238, 0.95)",
      label: `${c.label} — ${c.count} viewing`
    });
  }
  const ringSrc = data ? [...data.online, ...data.viewers] : [];
  const activeKey = ringSrc.map((a) => `${a.lat},${a.lng}`).join("|");
  const rings = useMemo(
    () => activeKey ? activeKey.split("|").map((s) => { const [lat, lng] = s.split(",").map(Number); return { lat, lng }; }) : [],
    [activeKey]
  );
```

The centroid effect changes its source arrays from `data.customers`/`data.active` to iterate `[...data.members, ...data.online, ...data.viewers]` (each a `Cell` with `lat/lng/count` — push `{lat, lng, w: Math.max(1, count)}`).

The overlay: `data.totals.active` → `data.totals.online`; add a line `data.totals.viewers viewing now`; add a cyan legend row `Viewing now (anonymous)`.

- [ ] **Step 2: Typecheck**

Run: `cd apps/landing && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors; no remaining references to `COUNTRY_LL`, `data.customers`, or `data.active`.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/components/admin-globe.tsx
git commit -m "feat(globe): three-layer render (members/online/viewers) from server cells"
```

---

### Task 7: Deploy & verify

- [ ] **Step 1: Push** and wait for the deploy marker to flip (systemd timer rebuilds auth + landing).

- [ ] **Step 2: Verify the endpoint shape** (mint a read-only admin token in-container, as done for the empty-globe debug) — assert the JSON has `members/online/viewers/totals` and `totals.members` equals the summed member cell counts.

- [ ] **Step 3: Verify presence live:** `curl -s -o /dev/null -w "%{http_code}" -X POST https://auth.ggakingclub.com/auth/presence/ping -H 'Content-Type: application/json' -d '{"vid":"00000000-0000-4000-8000-000000000001"}'` → `204`; a bad vid → `400`. Then confirm the admin geo endpoint shows `totals.viewers >= 1` within 60s.

- [ ] **Step 4: Manual:** open the landing page → "viewing now" ticks up on the globe; close the tab → drops ~60s later.

---

## Notes for the executor
- `lookupGeo` is exported from `geo.ts` and imported by both `presence.ts` and the geo route — keep it there to avoid a circular split.
- Do **not** store IPs in the presence map — only country/region/rounded coords (privacy invariant).
- Client + server ship together; one failed 30s admin poll during rollout self-recovers.
