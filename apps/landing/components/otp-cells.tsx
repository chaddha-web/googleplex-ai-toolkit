"use client";

import { useRef, type KeyboardEvent, type ClipboardEvent } from "react";

type OtpCellsProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

/**
 * Six-cell numeric OTP input with auto-advance, auto-back, and paste support.
 */
export function OtpCells({ value, onChange }: OtpCellsProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (i: number, raw: string) => {
    if (!/^\d?$/.test(raw)) return;
    const next = [...value];
    next[i] = raw;
    onChange(next);
    if (raw && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const txt = e.clipboardData.getData("text").trim();
    if (/^\d{6}$/.test(txt)) {
      e.preventDefault();
      onChange(txt.split(""));
      refs.current[5]?.focus();
    }
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-between" onPaste={handlePaste}>
      {value.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          aria-label={`Digit ${i + 1}`}
          className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-semibold bg-[#1A1A1A] border-none rounded-xl text-white focus:ring-2 focus:ring-white/40 transition-shadow"
        />
      ))}
    </div>
  );
}
