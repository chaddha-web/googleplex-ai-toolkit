"use client";
// Minimal Select primitive that mimics the shadcn API surface
// (Select / SelectTrigger / SelectValue / SelectContent / SelectItem)
// but renders as a native <select> for v1. Drop-in replaceable with the
// Radix-backed shadcn version in a later sprint when we need rich options.
import * as React from "react";
import { cn } from "../cn";

interface SelectCtx {
  value?: string;
  onValueChange?: (v: string) => void;
  registerItem: (value: string, label: React.ReactNode) => void;
}
const Ctx = React.createContext<SelectCtx | null>(null);

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}

export function Select({ value, defaultValue, onValueChange, children }: SelectProps) {
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  const [items, setItems] = React.useState<Array<{ value: string; label: React.ReactNode }>>([]);
  const registerItem = React.useCallback((v: string, label: React.ReactNode) => {
    setItems((prev) => (prev.find((p) => p.value === v) ? prev : [...prev, { value: v, label }]));
  }, []);

  return (
    <Ctx.Provider value={{ value: current, onValueChange: (v) => { if (value === undefined) setInternal(v); onValueChange?.(v); }, registerItem }}>
      <div className="relative">
        {children}
        <select
          aria-hidden
          value={current ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (value === undefined) setInternal(v);
            onValueChange?.(v);
          }}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
        >
          {!current && <option value="" disabled />}
          {items.map((i) => (
            <option key={i.value} value={i.value}>
              {typeof i.label === "string" ? i.label : i.value}
            </option>
          ))}
        </select>
      </div>
    </Ctx.Provider>
  );
}

export function SelectTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-3 text-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  return <span className={ctx.value ? "" : "opacity-40"}>{ctx.value ?? placeholder}</span>;
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  // Items register themselves into context — rendered via the hidden <select>.
  return <>{children}</>;
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  React.useEffect(() => {
    ctx?.registerItem(value, children);
  }, [ctx, value, children]);
  return null;
}
