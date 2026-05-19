import * as React from "react";
import { cn } from "../cn";

export type BadgeVariant = "default" | "outline" | "success" | "warning" | "destructive" | "muted";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-white/15 text-white",
  outline: "border border-white/30 text-white",
  success: "bg-emerald-700/30 text-emerald-300",
  warning: "bg-amber-700/30 text-amber-300",
  destructive: "bg-rose-700/30 text-rose-300",
  muted: "bg-zinc-700/40 text-zinc-300"
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";
