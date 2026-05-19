import { cn } from "../cn";
import { Badge } from "./badge";


export type IdentityTier = "baseline" | "verified" | "high-stakes";

const TIER_CONFIG = {
  baseline: {
    label: "Baseline",
    variant: "outline" as const,
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20"
  },
  verified: {
    label: "Verified",
    variant: "success" as const,
    color: "bg-green-500/10 text-green-500 border-green-500/20"
  },
  "high-stakes": {
    label: "High Stakes",
    variant: "warning" as const,
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20"
  }
};

export function IdentityBadge({ 
  tier, 
  className 
}: { 
  tier: IdentityTier; 
  className?: string;
}) {
  const config = TIER_CONFIG[tier];
  
  return (
    <Badge 
      variant={config.variant} 
      className={cn("px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold", config.color, className)}
    >
      {config.label}
    </Badge>
  );
}
