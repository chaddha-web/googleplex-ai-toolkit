"use client";

import { LegalLayout } from "@/app/privacy/page";

const sections = [
  {
    title: "Accepting these terms",
    body:
      "By creating an account or using GoogolPlex you agree to these terms. If you don't agree, please don't use the service. We may update the terms occasionally; significant changes will be announced inside the app at least 14 days before they take effect."
  },
  {
    title: "Your account",
    body:
      "You're responsible for keeping your sign-in details and wallet password safe. You must give us accurate information when you sign up and keep it current. Accounts are for individual humans — no shared logins, no bots, no resale of access."
  },
  {
    title: "Wallet custody and risk",
    body:
      "GoogolPlex custodies wallet keys on your behalf. You are responsible for confirming withdrawal addresses; transactions on public blockchains are final and we cannot reverse a transfer to the wrong address. Crypto assets are volatile and may lose value; nothing on this platform is investment advice."
  },
  {
    title: "Acceptable use",
    body:
      "Don't use GoogolPlex for anything illegal in your jurisdiction or ours, including money laundering, terrorism financing, sanctions evasion, or fraud. Don't attempt to disrupt the service or other users. Don't reverse-engineer or scrape it. We reserve the right to suspend any account that breaches these rules pending review."
  },
  {
    title: "Fees",
    body:
      "Network fees (gas) on withdrawals are paid by you and are visible before you confirm a transaction. Platform fees, if any, are itemised at the same point. We do not take a fee on deposits or on internal swaps in v1."
  },
  {
    title: "Service availability",
    body:
      "We aim for 99%+ uptime but make no guarantee. Scheduled maintenance is announced in-app. We may temporarily restrict withdrawals during a security incident or while reconciling chain state — we'll keep you informed if it happens."
  },
  {
    title: "Limitation of liability",
    body:
      "To the extent allowed by law, GoogolPlex's total liability for any claim is capped at the platform fees you paid in the 12 months before the claim. We are not liable for indirect, consequential, or punitive damages, or for losses arising from third-party chain or wallet behaviour."
  },
  {
    title: "Termination",
    body:
      "You may close your account at any time from the dashboard. We may suspend or terminate an account that breaches these terms or that we reasonably believe is being used to defraud the platform or its users. After termination you retain the right to withdraw any positive balance, subject to security review."
  },
  {
    title: "Governing law",
    body:
      "These terms are governed by the laws of India. Disputes will be resolved in the courts of New Delhi unless a different forum is required by your local consumer protection law."
  },
  {
    title: "Contact",
    body:
      "Questions about these terms — write to start@ggakingclub.com."
  }
];

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Terms & Conditions"
      title={
        <>
          The <em className="font-serif-i text-white/60">agreement</em>.
        </>
      }
      intro="Plain-English version of how we work together. The legal language is here too — read carefully."
      updated="Last updated · 19 May 2026"
      sections={sections}
    />
  );
}
