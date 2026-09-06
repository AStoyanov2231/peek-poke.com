"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, ScanQrCode, X } from "lucide-react";
import { sharedGroupQrContentError } from "@peekpoke/shared";
import { decodeQrVideoFrame, QrDecoderUnavailableError } from "./qr-decoder";

interface QrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDecoded: (content: string) => Promise<void>;
}

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
type ScannerState =
  | "starting"
  | "scanning"
  | "submitting"
  | "success"
  | "insecure"
  | "unsupported"
  | "denied"
  | "no-camera"
  | "decoder-unavailable"
  | "playback-error"
  | "error";
type Decoder = { detector: Detector | null; canvas: HTMLCanvasElement | null };

function errorName(error: unknown) {
  return error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name
    : "";
}

function statusForState(state: ScannerState) {
  switch (state) {
    case "starting": return "Starting camera";
    case "scanning": return "Align a QR code inside the frame";
    case "submitting": return "Joining shared group";
    case "success": return "Shared group joined";
    case "insecure": return "Secure connection required";
    case "unsupported": return "Camera unavailable in this browser";
    case "denied": return "Camera access is blocked";
    case "no-camera": return "No camera found";
    case "decoder-unavailable": return "QR scanning unavailable";
    case "playback-error": return "Camera preview could not play";
    case "error": return "Camera could not start";
  }
}

function errorForState(state: ScannerState) {
  switch (state) {
    case "insecure": return "Open Peek & Poke over HTTPS to use the camera. Localhost is supported for development.";
    case "unsupported": return "This browser cannot access a camera. Try a current browser on a device with a camera.";
    case "denied": return "Camera access is blocked. Allow it in your browser settings, then try again.";
    case "no-camera": return "No camera was found. Connect a camera and try again.";
    case "decoder-unavailable": return "This browser could not load a QR decoder. Try a current browser or another device.";
    case "playback-error": return "The camera preview could not start. Close other camera tabs and try again.";
    case "error": return "The camera could not start. Try again.";
    default: return null;
  }
}

// Scanner lifecycle is intentionally kept together so acquisition, decoding, and
// cleanup share the same disposed and duplicate-submission fences.
// react-doctor-disable-next-line no-high-complexity-react-function, no-giant-component
export function QrScannerDialog({ open, onClose, onDecoded }: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);
  const retryCameraRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<ScannerState>("starting");
  const [error, setError] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);

  // Browser permission and media promises must update the visible state after resolution.
  // react-doctor-disable-next-line no-set-state-after-await-in-effect
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let decoder: Decoder = { detector: null, canvas: null };
    let starting = false;
    let restartRequested = false;
    let visibilityPaused = false;
    const bodyOverflow = document.body?.style?.overflow;
    const isDocumentHidden = () => document.visibilityState === "hidden";

    if (document.body?.style) document.body.style.overflow = "hidden";

    const stopStream = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };

    const showCameraError = (nextState: ScannerState, message = errorForState(nextState)) => {
      if (disposed) return;
      stopStream();
      setState(nextState);
      setError(message);
    };

    const submit = async (content: string) => {
      if (disposed || submittingRef.current) return;
      const contentError = sharedGroupQrContentError(content);
      if (contentError) {
        stopStream();
        retryRef.current = null;
        setRetryAvailable(false);
        setState("error");
        setError(contentError === "too_long"
          ? "This QR code is too long to scan. Try another QR code."
          : "This QR code is empty or invalid. Try another QR code.");
        return;
      }
      submittingRef.current = true;
      restartRequested = false;
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
        stopStream();
        submittingRef.current = false;
        setState("error");
        setError(failure instanceof Error ? failure.message : "Could not join this shared group. Try again.");
      }
    };

    const detect = async () => {
      if (disposed || visibilityPaused || submittingRef.current || (!decoder.detector && !decoder.canvas)) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        if (!disposed && !visibilityPaused && !submittingRef.current) timer = window.setTimeout(() => void detect(), 220);
        return;
      }

      try {
        let content: string | undefined;
        if (decoder.detector) {
          const results = await decoder.detector.detect(video);
          content = results[0]?.rawValue;
        } else if (decoder.canvas) {
          content = decodeQrVideoFrame(video, decoder.canvas) ?? undefined;
        }
        if (typeof content === "string") {
          await submit(content);
          return;
        }
      } catch (failure) {
        if (failure instanceof QrDecoderUnavailableError) {
          showCameraError("decoder-unavailable");
          return;
        }
        // A native detector can exist but fail on a browser's implementation.
        // Switch to the canvas decoder rather than leaving a live but unusable view.
        if (decoder.detector && decoder.canvas) decoder.detector = null;
        else if (decoder.detector) {
          showCameraError("decoder-unavailable");
          return;
        }
      }
      if (!disposed && !visibilityPaused && !submittingRef.current) timer = window.setTimeout(() => void detect(), 220);
    };

    const createDecoder = (): Decoder | null => {
      const detectorConstructor = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      let detector: Detector | null = null;
      if (detectorConstructor) {
        try {
          detector = new detectorConstructor({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }

      let canvas: HTMLCanvasElement | null = null;
      try {
        const candidate = document.createElement("canvas");
        if (candidate.getContext("2d", { willReadFrequently: true })) canvas = candidate;
      } catch {
        canvas = null;
      }
      return detector || canvas ? { detector, canvas } : null;
    };

    const start = async () => {
      if (disposed || visibilityPaused || submittingRef.current) return;
      if (starting) {
        restartRequested = true;
        return;
      }
      if (isDocumentHidden()) {
        visibilityPaused = true;
        return;
      }
      starting = true;
      setState("starting");
      setError(null);
      try {
        if (window.isSecureContext === false) {
          showCameraError("insecure");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          showCameraError("unsupported");
          return;
        }

        // Request the camera before checking BarcodeDetector. Browsers can have
        // a usable camera and permission prompt even when native decoding is absent.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (disposed || submittingRef.current || visibilityPaused || isDocumentHidden() || !videoRef.current) {
          stopStream();
          return;
        }
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          showCameraError("playback-error");
          return;
        }
        if (disposed || submittingRef.current || visibilityPaused || isDocumentHidden()) {
          stopStream();
          return;
        }

        const nextDecoder = createDecoder();
        if (!nextDecoder) {
          showCameraError("decoder-unavailable");
          return;
        }
        decoder = nextDecoder;
        setState("scanning");
        void detect();
      } catch (failure) {
        if (disposed) return;
        const name = errorName(failure);
        if (name === "NotAllowedError" || name === "SecurityError") {
          showCameraError("denied");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          showCameraError("no-camera");
        } else {
          showCameraError("error");
        }
      } finally {
        starting = false;
        const shouldRestart = restartRequested
          && !disposed
          && !visibilityPaused
          && !submittingRef.current
          && stream === null;
        restartRequested = false;
        if (shouldRestart) void start();
      }
    };

    retryCameraRef.current = () => {
      retryRef.current = null;
      setRetryAvailable(false);
      void start();
    };
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onVisibilityChange = () => {
      if (isDocumentHidden()) {
        visibilityPaused = true;
        stopStream();
        if (!submittingRef.current) {
          setState("error");
          setError("Camera paused while Peek & Poke was in the background. Try again when you return.");
        }
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
      submittingRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(focusTimer);
      stopStream();
      retryRef.current = null;
      retryCameraRef.current = null;
      if (document.body?.style) document.body.style.overflow = bodyOverflow ?? "";
    };
  }, [onDecoded, open]);

  if (!open || typeof document === "undefined") return null;

  const statusCopy = statusForState(state);
  const stateError = error ?? errorForState(state);
  const isBusy = state === "starting" || state === "submitting";
  const canRetry = retryAvailable || ["insecure", "unsupported", "denied", "no-camera", "decoder-unavailable", "playback-error", "error"].includes(state);
  const retryLabel = retryAvailable ? "Retry joining" : "Try camera again";

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === dialogRef.current || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === dialogRef.current || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black">
      <dialog
        aria-labelledby="qr-scanner-title"
        aria-modal="true"
        className="fixed inset-0 m-0 flex h-[100dvh] w-full max-w-none flex-col overflow-hidden border-0 bg-black p-0 text-white"
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onKeyDown={handleDialogKeyDown}
        open
        ref={dialogRef}
        tabIndex={-1}
      >
        <header
          className="relative z-10 flex shrink-0 items-center justify-between gap-3 bg-black/80 px-4 pb-3 backdrop-blur-sm sm:px-6"
          style={{ paddingTop: "calc(var(--safe-area-top) + 12px)" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <ScanQrCode aria-hidden="true" className="shrink-0 text-white" size={22} />
            <div className="min-w-0">
              <h2 className="t-title-3 truncate text-white" id="qr-scanner-title">Scan to join</h2>
              <p className="t-caption text-white/70">Join the group linked to this QR code</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close QR scanner"
            className="iconbtn shrink-0 !bg-white/10 !text-white !shadow-none hover:!bg-white/20"
            style={{ width: 44, height: 44 }}
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-ink-9">
          <video ref={videoRef} aria-label="Live QR code camera preview" autoPlay className="absolute inset-0 h-full w-full object-cover" muted playsInline />
          <div aria-hidden="true" className="absolute inset-0 bg-black/20" />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 aspect-square w-[min(78vw,52vh,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border-2 border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.26)]"
          />
          {state !== "scanning" && state !== "submitting" && state !== "success" ? (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
              <div className="flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-black/65 px-5 py-4 backdrop-blur-sm">
                <Camera aria-hidden="true" size={28} />
                <p className="t-body-b text-white">{statusCopy}</p>
              </div>
            </div>
          ) : null}
          {state === "submitting" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-3 text-sm font-semibold text-white">
                <Loader2 aria-hidden="true" className="animate-spin" size={20} />
                <span>Joining shared group</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer
          className="relative z-10 shrink-0 bg-black/90 px-4 pt-4 backdrop-blur-sm sm:px-6"
          style={{ paddingBottom: "calc(var(--safe-area-bottom) + 16px)" }}
        >
          <div className="mx-auto w-full max-w-xl">
            <p aria-live="polite" className="t-body-b text-white">{statusCopy}</p>
            <p className="t-caption mt-1 text-white/65">Anyone with the same code can join. QR links are never opened.</p>
            {stateError ? (
              <p aria-live="assertive" className="mt-2 text-sm font-medium text-red-300" role="alert">{stateError}</p>
            ) : null}
            <button
              type="button"
              aria-label={retryLabel}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-default disabled:opacity-60"
              disabled={isBusy || state === "scanning" || state === "success" || !canRetry}
              onClick={() => {
                if (retryAvailable) retryRef.current?.();
                else retryCameraRef.current?.();
              }}
            >
              <ScanQrCode aria-hidden="true" size={18} />
              {retryAvailable ? "Retry joining" : state === "scanning" ? "Scanning for QR code" : "Try camera again"}
            </button>
          </div>
        </footer>
      </dialog>
    </div>,
    document.body,
  );
}
