"use client";
import * as React from "react";
import { cn } from "../cn";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, className, id, name }, ref) => {
    const [internal, setInternal] = React.useState(defaultChecked ?? false);
    const value = checked ?? internal;
    const toggle = () => {
      if (disabled) return;
      const next = !value;
      if (checked === undefined) setInternal(next);
      onCheckedChange?.(next);
    };
    return (
      <button
        ref={ref}
        id={id}
        name={name}
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          value ? "bg-emerald-500/70" : "bg-white/15",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
            value ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";
