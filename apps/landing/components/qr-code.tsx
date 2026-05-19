"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Lightweight inline QR code renderer.
 *
 * Uses the `qrcode` library to draw to a canvas client-side — no third-party
 * Google Charts image, no remote dependency. The light theme uses dark
 * modules on the surface color so it sits cleanly on the card it's pinned
 * into.
 */
export function QrCode({
  value,
  size = 160,
  fg = "#0F172A",
  bg = "#FFFFFF",
  className = ""
}: {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    QRCode.toCanvas(
      canvas,
      value,
      {
        width: size,
        margin: 1,
        color: { dark: fg, light: bg },
        errorCorrectionLevel: "M"
      },
      (err) => {
        if (err) setError(err.message);
      }
    );
  }, [value, size, fg, bg]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        aria-label={`QR code for ${value}`}
        className="rounded-lg block"
      />
      {error ? (
        <p className="text-xs text-rose-500 mt-2">QR error: {error}</p>
      ) : null}
    </div>
  );
}
