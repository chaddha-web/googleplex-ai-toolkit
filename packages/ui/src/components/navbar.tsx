import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-8">
        <div className="mr-4 flex">
          <Link className="mr-6 flex items-center space-x-2" href="/">
            <span className="font-bold sm:inline-block">Googolplex</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="flex items-center gap-4">
            <Link href="/proposals" className="text-sm font-medium hover:underline">Proposals</Link>
            <Link href="/projects" className="text-sm font-medium hover:underline">Projects</Link>
            <Link href="/studio" className="text-sm font-medium hover:underline">Studio</Link>
            <Link href="/wallet" className="text-sm font-medium hover:underline">Wallet</Link>
            
            {/* Wallet Connect Indicator */}
            <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-full text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="font-mono">0x123...abc</span>
              <span className="opacity-50">|</span>
              <span className="font-bold text-success">1,250 GGX</span>
              <Badge variant="outline" className="ml-1 scale-75">Verified</Badge>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
