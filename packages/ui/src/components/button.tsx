import * as React from "react";
import { cn } from "../cn";

export type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner, set aria-busy, and block interaction while an async action runs. */
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  default: "bg-white text-black hover:opacity-90",
  outline: "border border-white/20 text-white hover:bg-white/10",
  ghost: "text-white hover:bg-white/10",
  destructive: "bg-rose-600 text-white hover:bg-rose-500",
  secondary: "bg-white/10 text-white hover:bg-white/20"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10"
};

// One focus system for every primitive: a brand-purple ring that stays visible
// on both the dark (landing/cosmic) and light-remapped (web) surfaces, since a
// literal colour isn't touched by the app's white→ink utility remap.
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#8A68FF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", loading = false, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium select-none whitespace-nowrap",
        "transition-[transform,background-color,color,opacity,box-shadow] duration-150 ease-out",
        "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        focusRing,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";
