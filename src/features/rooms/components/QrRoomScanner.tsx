"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type BarcodeWindow = Window & typeof globalThis & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

export function QrRoomScanner({
  onPayload,
  onClose,
}: {
  onPayload: (payload: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onPayloadRef = useRef(onPayload);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState("");

  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    const detectorConstructor = (window as BarcodeWindow).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      window.setTimeout(() => {
        if (!cancelled) setCameraError("Camera scanning is not available in this browser.");
      }, 0);
      return;
    }

    void navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }).then((stream) => {
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      void video.play();
      if (!detectorConstructor) {
        setCameraError("Automatic QR detection is not supported here. Paste the room code below.");
        return;
      }
      const detector = new detectorConstructor({ formats: ["qr_code"] });
      let active = true;
      const scan = async () => {
        if (!active || cancelled || !video) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          window.setTimeout(() => void scan(), 250);
          return;
        }
        try {
          const result = await detector.detect(video);
          const value = result[0]?.rawValue?.trim();
          if (value) {
            active = false;
            onPayloadRef.current(value);
            return;
          }
        } catch {
          // Camera frames can be undecodable while the camera is starting.
        }
        if (active && !cancelled) window.setTimeout(() => void scan(), 250);
      };
      void scan();
    }).catch(() => {
      if (!cancelled) setCameraError("Camera access was denied. Paste the room code below.");
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-e-2">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <ScanLine size={18} className="text-primary" />
            <h2 className="t-body-b text-ink-9">Scan a room QR code</h2>
          </div>
          <button type="button" className="iconbtn" aria-label="Close scanner" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="QR scanner camera" />
            <div className="pointer-events-none absolute inset-12 rounded-2xl border-2 border-white/80" />
          </div>
          {cameraError ? <p className="mt-3 text-sm text-ink-6">{cameraError}</p> : null}
          <div className="mt-4 flex gap-2">
            <input
              value={manualPayload}
              onChange={(event) => setManualPayload(event.target.value)}
              placeholder="Paste a room code"
              aria-label="Room QR payload"
              className="h-10 min-w-0 flex-1 rounded-lg border border-hairline bg-background px-3 text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!manualPayload.trim()}
              onClick={() => onPayload(manualPayload.trim())}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
