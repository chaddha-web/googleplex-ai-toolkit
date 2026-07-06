"use client";

import { useEffect } from "react";
import Link from "next/link";
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
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <header className="relative z-10 border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link href="/app/admin" className="text-white/60 hover:text-white text-sm">
          ← Admin
        </Link>
        <h1 className="text-lg font-medium">Customer globe</h1>
        <span className="ml-auto inline-flex items-center gap-2 text-xs text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          LIVE · refreshes every 30s
        </span>
      </header>
      <AdminGlobe />
    </div>
  );
}
