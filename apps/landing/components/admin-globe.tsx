"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { authedFetch, AUTH_BASE } from "@/lib/auth-client";

/**
 * Live customer globe (admin). Three layers, all aggregate-only (country/state
 * + counts + a label) — the endpoint never returns IPs or identities:
 *  - gold dots        = all members, placed from IP (else country centroid)
 *  - emerald + rings  = members online right now
 *  - cyan + rings     = anonymous visitors viewing a public page right now
 * Placement + labels are computed server-side; the client just plots cells.
 * Polls every 30 s.
 */

type Cell = { lat: number; lng: number; count: number; label: string };

type GeoResponse = {
  members: Cell[];
  online: Cell[];
  viewers: Cell[];
  totals: { members: number; online: number; viewers: number };
};

type Pt = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
};

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
    // Don't poll a tab nobody's looking at.
    if (typeof document !== "undefined" && document.hidden) return;
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

  // Pause the three.js render loop (and rotation) while the tab is hidden to
  // save GPU/battery; resume and refresh immediately on return.
  useEffect(() => {
    const onVis = () => {
      const g = globeRef.current;
      if (document.hidden) {
        g?.pauseAnimation();
      } else {
        g?.resumeAnimation();
        load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  // Slow auto-rotate once the globe is ready. Gentle so a single populated
  // region stays in view rather than being whisked to the far side.
  const onReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

  // Frame the camera on wherever the activity actually is, the first time we get
  // data — so the globe never opens on an empty ocean. Spherical (vector) mean,
  // correct even across the antimeridian. Runs once, so it won't fight manual
  // rotation on later 30 s refreshes.
  useEffect(() => {
    if (focused.current || !data || !globeRef.current) return;
    const cells = [...data.members, ...data.online, ...data.viewers];
    if (cells.length === 0) return;
    const R = Math.PI / 180;
    let x = 0, y = 0, z = 0, tw = 0;
    for (const c of cells) {
      const w = Math.max(1, c.count);
      const la = c.lat * R, lo = c.lng * R;
      x += Math.cos(la) * Math.cos(lo) * w;
      y += Math.cos(la) * Math.sin(lo) * w;
      z += Math.sin(la) * w;
      tw += w;
    }
    if (tw === 0) return;
    const lng = Math.atan2(y / tw, x / tw) / R;
    const lat = Math.atan2(z / tw, Math.hypot(x / tw, y / tw)) / R;
    globeRef.current.pointOfView({ lat, lng, altitude: 2.1 }, 1400);
    focused.current = true;
  }, [data]);

  const points: Pt[] = [];
  if (data) {
    for (const c of data.members) {
      points.push({
        lat: c.lat,
        lng: c.lng,
        size: Math.min(0.9, 0.3 + Math.sqrt(c.count) * 0.08),
        color: "rgba(255, 200, 90, 0.9)",
        label: `${c.label} — ${c.count} member${c.count === 1 ? "" : "s"}`
      });
    }
    for (const c of data.online) {
      points.push({
        lat: c.lat,
        lng: c.lng,
        size: Math.min(1.1, 0.45 + Math.sqrt(c.count) * 0.1),
        color: "rgba(52, 211, 153, 0.98)",
        label: `${c.label} — ${c.count} online`
      });
    }
    for (const c of data.viewers) {
      points.push({
        lat: c.lat,
        lng: c.lng,
        size: Math.min(1.0, 0.4 + Math.sqrt(c.count) * 0.1),
        color: "rgba(34, 211, 238, 0.95)",
        label: `${c.label} — ${c.count} viewing`
      });
    }
  }

  // Rings pulse for anything "live" (online + viewers). Keep the ring objects
  // stable between polls when locations are unchanged so the pulse doesn't reset.
  const ringSrc = data ? [...data.online, ...data.viewers] : [];
  const activeKey = ringSrc.map((a) => `${a.lat},${a.lng}`).join("|");
  const rings = useMemo(
    () =>
      activeKey
        ? activeKey.split("|").map((s) => {
            const [lat, lng] = s.split(",").map(Number);
            return { lat, lng };
          })
        : [],
    [activeKey]
  );

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
            {data ? data.totals.online : "—"}{" "}
            <span className="text-emerald-300 text-sm align-middle">online</span>
          </p>
          <p className="text-white/70 text-sm mt-0.5">
            {data ? data.totals.viewers : "—"}{" "}
            <span className="text-cyan-300">viewing now</span>
          </p>
          <p className="text-white/50 text-xs mt-0.5">
            {data ? data.totals.members : "—"} members worldwide
          </p>
        </div>
        <div className="rounded-xl bg-black/50 backdrop-blur px-4 py-2.5 ring-1 ring-white/10 text-xs space-y-1">
          <p className="text-white/70">
            <span className="inline-block h-2 w-2 rounded-full align-middle mr-2" style={{ background: "rgba(52,211,153,0.95)" }} />
            Online now (state-level)
          </p>
          <p className="text-white/70">
            <span className="inline-block h-2 w-2 rounded-full align-middle mr-2" style={{ background: "rgba(34,211,238,0.95)" }} />
            Viewing now (anonymous)
          </p>
          <p className="text-white/70">
            <span className="inline-block h-2 w-2 rounded-full align-middle mr-2" style={{ background: "rgba(255,200,90,0.9)" }} />
            All members (where from)
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
