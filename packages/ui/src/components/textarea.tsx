import * as React from "react";
import { cn } from "../cn";
import { focusRing } from "./button";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm",
        "placeholder:opacity-50 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "aria-[invalid=true]:border-rose-500/70 aria-[invalid=true]:focus-visible:ring-rose-500/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        focusRing,
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
