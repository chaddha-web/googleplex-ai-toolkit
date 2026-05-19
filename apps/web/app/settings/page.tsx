"use client";

import { useAuth } from "@/components/auth-context";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

export default function SettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-white/40 text-xs tracking-[0.3em] uppercase">Settings</p>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight mt-2">
        Your <em className="font-serif-i text-white/60">account</em>.
      </h1>

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
                ? `${LANDING_URL}/app/setup/wallet`
                : `${LANDING_URL}/app/setup/deposit`
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
          One device per browser. Use the Sign out button (top right) to revoke
          this session. Revoke-all-sessions endpoint is in the auth service
          roadmap.
        </p>
      </Section>
    </div>
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
