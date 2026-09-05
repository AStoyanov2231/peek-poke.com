"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, ScanQrCode, X } from "lucide-react";
import { sharedGroupQrContentError } from "@peekpoke/shared";

interface QrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDecoded: (content: string) => Promise<void>;
}

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

type ScannerState = "starting" | "scanning" | "submitting" | "success" | "unsupported" | "denied" | "error";

export function QrScannerDialog({ open, onClose, onDecoded }: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);
  const submitRef = useRef<((content: string) => Promise<void>) | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<ScannerState>("starting");
  const [error, setError] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [manualContent, setManualContent] = useState("");

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let detector: Detector | null = null;
    let starting = false;
    let visibilityPaused = false;

    const stopStream = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    stopStreamRef.current = stopStream;
    window.setTimeout(() => dialogRef.current?.focus(), 0);

    const submit = async (content: string) => {
      if (disposed || submittingRef.current) return;
      const contentError = sharedGroupQrContentError(content);
      if (contentError) {
        stopStream();
        retryRef.current = null;
        setState("error");
        setError(contentError === "too_long"
          ? "This QR code is too long. Enter a shorter QR text below."
          : "This QR code is empty or invalid. Enter the QR text below.");
        return;
      }
      submittingRef.current = true;
      retryRef.current = () => void submit(content);
      setRetryAvailable(true);
      stopStream();
      setState("submitting");
      setError(null);
      try {
        await onDecoded(content);
        retryRef.current = null;
        if (!disposed) {
          setRetryAvailable(false);
          setState("success");
        }
      } catch (failure) {
        if (disposed) return;
        submittingRef.current = false;
        setState("error");
        setError(failure instanceof Error ? failure.message : "Could not join this shared group.");
      }
    };
    submitRef.current = submit;

    const detect = async () => {
      if (disposed || visibilityPaused || submittingRef.current || !detector || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const results = await detector.detect(videoRef.current);
        const content = results[0]?.rawValue;
        if (typeof content === "string") {
          await submit(content);
          return;
        }
      } catch {
        // A frame can be unavailable while the camera is warming up. Keep
        // scanning and reserve visible errors for permission/device failures.
      }
      if (!disposed && !visibilityPaused && !submittingRef.current) timer = window.setTimeout(() => void detect(), 220);
    };

    const start = async () => {
      if (disposed || visibilityPaused || submittingRef.current || starting) return;
      if (document.visibilityState === "hidden") {
        visibilityPaused = true;
        return;
      }
      starting = true;
      const detectorConstructor = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      try {
        if (!detectorConstructor || !navigator.mediaDevices?.getUserMedia) {
          setState("unsupported");
          return;
        }
        detector = new detectorConstructor({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (disposed || visibilityPaused || document.visibilityState === "hidden" || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (disposed || visibilityPaused || document.visibilityState === "hidden") {
          stopStream();
          return;
        }
        setState("scanning");
        void detect();
      } catch (failure) {
        if (disposed) return;
        stopStream();
        const name = failure instanceof DOMException ? failure.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState("denied");
          setError("Camera access was denied. Allow camera access in your browser settings, or enter the QR text below.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setState("unsupported");
          setError("No camera is available in this environment. Enter the QR text below instead.");
        } else {
          setState("error");
          setError("The camera could not start. Try again or enter the QR text below.");
        }
      } finally {
        starting = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        visibilityPaused = true;
        stopStream();
        if (!submittingRef.current) setState("error");
        if (!submittingRef.current) setError("Camera paused while Peek & Poke was in the background. Try again when you return.");
        return;
      }
      if (visibilityPaused && !submittingRef.current && !disposed) {
        visibilityPaused = false;
        setState("starting");
        setError(null);
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void start();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopStream();
      stopStreamRef.current = null;
      retryRef.current = null;
      submitRef.current = null;
    };
  }, [onDecoded, open]);

  if (!open || typeof document === "undefined") return null;

  const canSubmitManual = manualContent.length > 0;
  const statusCopy = state === "starting"
    ? "Starting camera…"
    : state === "scanning"
      ? "Point your camera at any QR code"
      : state === "submitting"
        ? "Joining shared group…"
        : state === "success"
          ? "Shared group joined"
          : "Camera scanning is unavailable";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6">
      <dialog
        aria-labelledby="qr-scanner-title"
        aria-modal="true"
        className="relative m-0 w-full max-w-md overflow-hidden rounded-2xl border-0 bg-surface p-0 shadow-e-2"
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
        open
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ScanQrCode aria-hidden="true" size={20} />
            <h2 className="t-title-3 text-ink-9" id="qr-scanner-title">Join a shared group</h2>
          </div>
          <button type="button" aria-label="Close QR scanner" className="iconbtn" style={{ width: 36, height: 36 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-ink-9">
            <video ref={videoRef} aria-label="QR code camera preview" className="h-full w-full object-cover" muted playsInline />
            {state !== "scanning" && state !== "submitting" && state !== "success" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white">
                <Camera aria-hidden="true" size={28} />
                <p className="text-sm font-semibold">{statusCopy}</p>
              </div>
            ) : null}
            {state === "submitting" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
                <Loader2 aria-hidden="true" className="animate-spin" size={28} />
                <p className="text-sm font-semibold">Joining shared group…</p>
              </div>
            ) : null}
          </div>

          <div>
            <p className="t-body-b text-ink-9">{statusCopy}</p>
            <p className="t-caption muted mt-1">
              Anyone with the same code can join. A QR scan is not proof that you are at a location, and Peek &amp; Poke never opens QR links.
            </p>
          </div>

          {error ? (
            <div className="flex items-center justify-between gap-3" role="alert">
              <p aria-live="assertive" className="t-caption text-danger-600">{error}</p>
              {retryAvailable ? <button type="button" className="btn btn-secondary btn-sm min-h-11 shrink-0" onClick={() => retryRef.current?.()}>Retry</button> : null}
            </div>
          ) : null}

          <div className="space-y-2 border-t border-hairline pt-3">
            <label className="t-caption text-ink-7" htmlFor="qr-manual-content">Can’t scan? Enter the QR text</label>
            <div className="flex gap-2">
              <input
                id="qr-manual-content"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-hairline bg-ink-1 px-3 text-sm text-ink-9 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(event) => setManualContent(event.target.value)}
                placeholder="Paste QR text"
                spellCheck={false}
                type="text"
                value={manualContent}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm min-h-11"
                disabled={!canSubmitManual || state === "submitting"}
                onClick={() => {
                  const content = manualContent;
                  if (content) void submitRef.current?.(content);
                }}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
