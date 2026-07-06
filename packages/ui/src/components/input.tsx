import * as React from "react";
import { cn } from "../cn";
import { focusRing } from "./button";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm",
        "placeholder:opacity-50 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
        // Error state: any consumer can flip it with aria-invalid — renders
        // legible rose in every theme (not touched by the white remap).
        "aria-[invalid=true]:border-rose-500/70 aria-[invalid=true]:focus-visible:ring-rose-500/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        focusRing,
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
