"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Camera QR scanner for filling a destination wallet address.
 *
 * Uses getUserMedia + jsQR (canvas frame decode) so it works across browsers
 * including iOS Safari, where the native BarcodeDetector isn't available.
 * On a successful decode it cleans common address-URI wrappers (e.g.
 * "ethereum:0x…@1?value=1", "bitcoin:bc1…?amount=1", "tron:T…") down to the
 * bare address, hands it back, and releases the camera.
 */
function cleanScannedAddress(raw: string): string {
  let s = raw.trim();
  // Strip a URI scheme prefix ("ethereum:", "tron:", "bitcoin:", …). A bare
  // 0x/T/bc1 address has no colon, so it passes through untouched.
  const colon = s.indexOf(":");
  if (colon !== -1) s = s.slice(colon + 1);
  // Drop EIP-681 "@chainId" and any "?query" params.
  const at = s.indexOf("@");
  if (at !== -1) s = s.slice(0, at);
  const q = s.indexOf("?");
  if (q !== -1) s = s.slice(0, q);
  return s.trim();
}

export function QrScanner({
  onResult,
  onClose
}: {
  onResult: (address: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              const addr = cleanScannedAddress(code.data);
              if (addr) {
                stop();
                onResult(addr);
                return;
              }
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("This browser can't access the camera. Paste the address instead.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera permission denied. Allow access or paste the address."
            : "Couldn't open the camera on this device. Paste the address instead."
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onResult]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#111022] rounded-2xl overflow-hidden ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-center justify-between">
          <p className="text-white text-sm font-medium">Scan wallet address</p>
          <button onClick={onClose} className="text-white/50 hover:text-white text-sm">
            Close
          </button>
        </div>
        <div className="relative aspect-square bg-black">
          {error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/70 text-sm">
              {error}
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <p className="p-4 text-white/40 text-xs text-center">
          Point your camera at the recipient&apos;s QR code — the address fills in
          automatically.
        </p>
      </div>
    </div>
  );
}
