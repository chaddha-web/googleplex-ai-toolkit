"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { uploadAvatar } from "@/lib/auth-client";

export default function SettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Settings</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Your <em className="font-serif-i text-white/60">account</em>.
      </h1>

      <AvatarSection />

      <Section title="Profile">
        <Row label="Name" value={`${user.firstName} ${user.lastName}`} />
        <Row label="Email" value={user.email} />
        <Row label="Member ID" value={user.code11} mono />
        <Row label="Role" value={user.role} />
        <Row label="Country" value={user.country ?? "—"} />
        <Row label="Age" value={user.age != null ? String(user.age) : "—"} />
        <Row label="Gender" value={user.gender ?? "—"} />
      </Section>

      <Section title="Notifications">
        <Row
          label="Product & account emails"
          value={user.notificationsOptIn ? "On" : "Off"}
        />
        <p className="text-white/40 text-xs mt-3">
          Toggle endpoint coming next — for now, manage from your initial
          onboarding form.
        </p>
      </Section>

      <Section title="Wallet">
        <Row label="Status" value={prettyWallet(user.walletStatus)} />
        <Row
          label="Activation deposit"
          value={`$${(user.initialDepositCreditedUsd ?? 0).toFixed(2)} / $1.00`}
        />
        {user.walletStatus !== "active" && (
          <a
            href={
              user.walletStatus === "pending_password"
                ? "/setup/password"
                : "/setup/deposit"
            }
            className="inline-block mt-3 text-white text-sm hover:underline"
          >
            Finish wallet setup →
          </a>
        )}
      </Section>

      <Section title="Security">
        <Row label="Wallet password" value="Set via onboarding" />
        <p className="text-white/40 text-xs mt-3">
          Recovery flow (3-of-5 social guardians + delayed OTP fallback) lands
          alongside the MPC wallet rollout — see ADR-001.
        </p>
      </Section>

      <Section title="Sessions">
        <p className="text-white/60 text-sm leading-relaxed">
          Manage every device you're signed in on — and sign out of others — from{" "}
          <a href="/account/security" className="text-white hover:underline">
            Security
          </a>
          . Use the sign-out control in the sidebar account row to end this session.
        </p>
      </Section>
    </div>
  );
}

// Resize + square-crop an image file to a small JPEG data URL, so uploads stay
// tiny and avatars are uniform.
function fileToSquareDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Canvas unavailable."));
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

function AvatarSection() {
  const { user, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const initial = (user?.firstName || "G").charAt(0).toUpperCase();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await fileToSquareDataUrl(f, 256);
      await uploadAvatar(dataUrl);
      await refreshUser();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Section title="Profile image">
      <div className="flex items-center gap-5">
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt="Your avatar"
            className="h-20 w-20 rounded-full object-cover ring-1 ring-white/15 shrink-0"
          />
        ) : (
          <div
            className="h-20 w-20 rounded-full grid place-items-center text-2xl font-semibold shrink-0"
            style={{ background: "linear-gradient(160deg,#8A68FF,#5A3CC8)", color: "#fff" }}
          >
            {initial}
          </div>
        )}
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 disabled:opacity-40 transition-colors"
          >
            {busy ? "Uploading…" : user?.avatarUrl ? "Change image" : "Upload image"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
            className="hidden"
          />
          <p className="text-white/40 text-xs mt-2">
            PNG, JPEG or WebP — auto-cropped to a square.
          </p>
          {err && <p className="text-rose-300 text-sm mt-2">{err}</p>}
        </div>
      </div>
    </Section>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 liquid-glass rounded-3xl p-6 md:p-8">
      <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-4">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/50">{label}</span>
      <span
        className={`text-white ${mono ? "font-mono tracking-widest text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function prettyWallet(s?: string): string {
  switch (s) {
    case "active":
      return "Active";
    case "pending_password":
      return "Password not set";
    case "pending_initial_deposit":
      return "Awaiting $1 activation deposit";
    case "locked":
      return "Locked";
    default:
      return "—";
  }
}
