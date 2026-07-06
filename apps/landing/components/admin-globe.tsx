"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { authedFetch, AUTH_BASE } from "@/lib/auth-client";

/**
 * Live customer globe (admin). Two layers:
 *  - dim gold dots  = all customers, by self-reported country (centroids)
 *  - emerald dots + pulsing rings = customers online right now, state-level
 * Data is aggregate-only (country/state + counts) — the endpoint never
 * returns IPs or identities. Polls every 30 s.
 */

// Centroids for the countries offered at onboarding ("Other" is skipped).
const COUNTRY_LL: Record<string, [number, number]> = {
  India: [21, 78],
  "United States": [38, -97],
  "United Kingdom": [54, -2],
  Canada: [56, -106],
  Australia: [-25, 134],
  Singapore: [1.35, 103.8],
  "United Arab Emirates": [24, 54],
  Germany: [51, 10],
  France: [46, 2],
  Netherlands: [52.2, 5.3],
  Brazil: [-10, -52],
  Mexico: [23, -102],
  Japan: [36, 138],
  "South Korea": [36, 128],
  Nigeria: [9, 8],
  "South Africa": [-29, 24]
};

type GeoResponse = {
  customers: { country: string; count: number }[];
  active: { country: string; region: string; lat: number; lng: number; count: number }[];
  totals: { customers: number; active: number };
};

type Pt = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
};

const regionNames =
  typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export default function AdminGlobe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const focused = useRef(false);
  const [data, setData] = useState<GeoResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Fill the viewport under the header.
  useEffect(() => {
    const measure = () =>
      setDims({ w: window.innerWidth, h: window.innerHeight - 65 });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`${AUTH_BASE}/auth/admin/geo`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not load geo data.");
      setData(d as GeoResponse);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Slow auto-rotate once the globe is ready. Speed is gentle so a single
  // populated region (e.g. everyone in India today) stays in view for a while
  // rather than being whisked to the far side.
  const onReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

  // Frame the camera on wherever the members actually are, the first time we
  // get data — so the globe never opens on an empty ocean. Uses a spherical
  // (vector) mean, which stays correct even when members straddle the
  // antimeridian once presence goes worldwide. Only runs once, so it won't
  // fight the admin's manual rotation on later 30s refreshes.
  useEffect(() => {
    if (focused.current || !data || !globeRef.current) return;
    const pts: { lat: number; lng: number; w: number }[] = [];
    for (const c of data.customers) {
      const ll = COUNTRY_LL[c.country];
      if (ll) pts.push({ lat: ll[0], lng: ll[1], w: Math.max(1, c.count) });
    }
    for (const a of data.active) pts.push({ lat: a.lat, lng: a.lng, w: Math.max(1, a.count) });
    if (pts.length === 0) return;
    const R = Math.PI / 180;
    let x = 0, y = 0, z = 0, tw = 0;
    for (const p of pts) {
      const la = p.lat * R, lo = p.lng * R;
      x += Math.cos(la) * Math.cos(lo) * p.w;
      y += Math.cos(la) * Math.sin(lo) * p.w;
      z += Math.sin(la) * p.w;
      tw += p.w;
    }
    if (tw === 0) return;
    const lng = Math.atan2(y / tw, x / tw) / R;
    const lat = Math.atan2(z / tw, Math.hypot(x / tw, y / tw)) / R;
    globeRef.current.pointOfView({ lat, lng, altitude: 2.1 }, 1400);
    focused.current = true;
  }, [data]);

  const points: Pt[] = [];
  if (data) {
    for (const c of data.customers) {
      const ll = COUNTRY_LL[c.country];
      if (!ll) continue;
      points.push({
        lat: ll[0],
        lng: ll[1],
        size: Math.min(0.9, 0.3 + Math.sqrt(c.count) * 0.08),
        color: "rgba(255, 200, 90, 0.9)",
        label: `${c.country} — ${c.count} member${c.count === 1 ? "" : "s"}`
      });
    }
    for (const a of data.active) {
      const where = a.region
        ? `${a.region}, ${countryName(a.country)}`
        : countryName(a.country);
      points.push({
        lat: a.lat,
        lng: a.lng,
        size: Math.min(1.1, 0.45 + Math.sqrt(a.count) * 0.1),
        color: "rgba(52, 211, 153, 0.98)",
        label: `${where} — ${a.count} online`
      });
    }
  }
  const rings = (data?.active ?? []).map((a) => ({ lat: a.lat, lng: a.lng }));

  return (
    <div className="relative">
      <Globe
        ref={globeRef}
        width={dims.w}
        height={dims.h}
        onGlobeReady={onReady}
        globeImageUrl="/globe/earth-night.jpg"
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="#8A68FF"
        atmosphereAltitude={0.18}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.07}
        pointRadius="size"
        pointLabel="label"
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (t: number) => `rgba(52, 211, 153, ${1 - t})`}
        ringMaxRadius={5}
        ringPropagationSpeed={1.6}
        ringRepeatPeriod={900}
      />

      {/* Overlay: totals + legend */}
      <div className="pointer-events-none absolute top-4 left-4 space-y-2">
        <div className="rounded-xl bg-black/50 backdrop-blur px-4 py-3 ring-1 ring-white/10">
          <p className="text-white text-2xl font-medium tracking-tight">
            {data ? data.totals.active : "—"}{" "}
            <span className="text-emerald-300 text-sm align-middle">online</span>
          </p>
          <p className="text-white/50 text-xs mt-0.5">
            {data ? data.totals.customers : "—"} members worldwide
          </p>
        </div>
        <div className="rounded-xl bg-black/50 backdrop-blur px-4 py-2.5 ring-1 ring-white/10 text-xs space-y-1">
          <p className="text-white/70">
            <span className="inline-block h-2 w-2 rounded-full align-middle mr-2" style={{ background: "rgba(52,211,153,0.95)" }} />
            Online now (state-level)
          </p>
          <p className="text-white/70">
            <span className="inline-block h-2 w-2 rounded-full align-middle mr-2" style={{ background: "rgba(255,200,90,0.75)" }} />
            All members (by country)
          </p>
        </div>
      </div>

      {err && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 text-rose-200 text-xs px-4 py-2">
          {err}
        </div>
      )}
    </div>
  );
}
