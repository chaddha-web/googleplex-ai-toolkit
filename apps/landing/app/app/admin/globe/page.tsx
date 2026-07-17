"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";

// react-globe.gl is WebGL/three — client-only, and heavy enough that it must
// never leak into other pages' bundles. Load it only here, only in the browser.
const AdminGlobe = dynamic(() => import("@/components/admin-globe"), {
  ssr: false,
  loading: () => (
    <div className="h-[70vh] grid place-items-center text-white/40 text-sm">
      Spinning up the globe…
    </div>
  )
});

export default function AdminGlobePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/app");
  }, [user, router]);

  if (!user || user.role !== "admin") return null;

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <span className="inline-flex items-center gap-2 text-xs text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          LIVE · refreshes every 30s
        </span>
      </div>
      <div className="rounded-2xl overflow-hidden border border-white/10">
        <AdminGlobe />
      </div>
    </>
  );
}
