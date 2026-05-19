import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Googolplex Admin",
  description: "Proposal builder for GoogolplexGovernor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-white/10 px-6 py-3 flex items-center gap-6 text-sm">
          <Link href="/" className="font-semibold">Googolplex Admin</Link>
          <span className="opacity-30">/</span>
          <Link href="/proposals/new" className="opacity-80 hover:opacity-100">New proposal</Link>
          <span className="ml-auto text-xs opacity-50">Operator UI · proposals only · no bypass</span>
        </nav>
        {children}
      </body>
    </html>
  );
}
