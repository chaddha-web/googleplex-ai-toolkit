"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { setNotifications, uploadAvatar } from "@/lib/auth-client";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  // Wallet status (and other fields) can go stale in context — refresh on open.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);
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

      <NotificationsSection />

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
        <Row
          label="Wallet password"
          value={user.walletStatus === "pending_password" ? "Not set yet" : "Set"}
        />
        <Row
          label="Wallet lock"
          value={user.walletStatus === "locked" ? "Frozen" : "Active"}
        />
        <a
          href="/account/security"
          className="inline-block mt-4 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-white/90 transition-colors"
        >
          Manage security →
        </a>
        <p className="text-white/40 text-xs mt-3">
          Change your wallet password, freeze / unlock your wallet, and review
          signed-in devices.
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

function Toggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-[58px] rounded-full shrink-0 transition-colors duration-200 shadow-inner ${
        checked ? "bg-emerald-500" : "bg-rose-500"
      } ${onChange ? "cursor-pointer" : "cursor-default"} ${
        disabled ? "opacity-100" : ""
      }`}
    >
      {/* State label sits opposite the knob, like a hardware switch. */}
      <span
        className={`absolute top-0 h-7 flex items-center text-[10px] font-bold tracking-wider text-white/90 select-none transition-all duration-200 ${
          checked ? "left-2.5" : "right-2.5"
        }`}
      >
        {checked ? "ON" : "OFF"}
      </span>
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
          checked ? "translate-x-[32px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  disabled,
  onChange
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-white text-sm">{label}</p>
        <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function NotificationsSection() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [security, setSecurity] = useState(true);
  const [funds, setFunds] = useState(true);
  const on = !!user?.notificationsOptIn;

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      await setNotifications(!on);
      await refreshUser();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Notifications">
      <ToggleRow
        label="Sign-in & security codes"
        desc="One-time codes for login, wallet actions, and withdrawals. Required to keep your account secure."
        checked={security}
        onChange={() => setSecurity((v) => !v)}
      />
      <ToggleRow
        label="Deposit & withdrawal alerts"
        desc="Confirmation emails whenever funds move in or out."
        checked={funds}
        onChange={() => setFunds((v) => !v)}
      />
      <ToggleRow
        label="Product & account emails"
        desc="Announcements, updates, and non-critical account notices."
        checked={on}
        disabled={busy}
        onChange={toggle}
      />
      {err && <p className="text-rose-300 text-sm mt-2">{err}</p>}
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
