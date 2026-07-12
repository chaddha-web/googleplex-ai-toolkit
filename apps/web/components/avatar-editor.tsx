"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";

/** Renders children into document.body so a `fixed` overlay can't be trapped by
 *  a transformed/filtered ancestor (the cosmic shell uses backdrop-filter, which
 *  otherwise makes `position:fixed` resolve against that box — clipping the modal
 *  into the page and blowing up its size). */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/**
 * Avatar tooling: a circular pan/zoom cropper (so members choose exactly what
 * shows inside their profile circle) and a webcam capture (so desktop users
 * can take a photo, not just upload a file). Both feed the same cropper and
 * emit a small square JPEG data URL ready for upload.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/** Render the chosen crop area to a `size`×`size` JPEG data URL. */
async function cropToDataUrl(src: string, area: Area, size = 256): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    size,
    size
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AvatarCropper({
  src,
  busy,
  onCancel,
  onSave
}: {
  src: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  async function save() {
    if (!area || working || busy) return;
    setWorking(true);
    try {
      onSave(await cropToDataUrl(src, area));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-[#111022] rounded-2xl overflow-hidden ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-center justify-between">
          <p className="text-white text-sm font-medium">Adjust your photo</p>
          <button onClick={onCancel} className="text-white/50 hover:text-white text-sm">
            Cancel
          </button>
        </div>
        <div className="relative aspect-square bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xs w-9">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-white"
              aria-label="Zoom"
            />
          </div>
          <p className="text-white/35 text-xs text-center">
            Drag to reposition · pinch or use the slider to zoom.
          </p>
          <button
            onClick={save}
            disabled={working || busy}
            className="w-full rounded-full bg-white text-black text-sm font-medium py-2.5 hover:bg-white/90 disabled:opacity-40"
          >
            {working || busy ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

export function WebcamCapture({
  onCapture,
  onCancel
}: {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("This browser can't access the camera. Upload a file instead.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" }
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera permission denied. Allow access or upload a file."
            : "Couldn't open the camera. Upload a file instead."
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror so the capture matches the preview (selfie view).
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, w, h);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-[#111022] rounded-2xl overflow-hidden ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-center justify-between">
          <p className="text-white text-sm font-medium">Take a photo</p>
          <button onClick={onCancel} className="text-white/50 hover:text-white text-sm">
            Cancel
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
                className="h-full w-full object-cover -scale-x-100"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[86%] w-[86%] rounded-full border-2 border-white/50" />
              </div>
            </>
          )}
        </div>
        <div className="p-4">
          <button
            onClick={snap}
            disabled={!!error}
            className="w-full rounded-full bg-white text-black text-sm font-medium py-2.5 hover:bg-white/90 disabled:opacity-40"
          >
            Capture
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
