import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SHARED_GROUP_QR_CONTENT_LENGTH,
  sharedGroupQrContentError,
} from "@peekpoke/shared";

const createPortal = vi.hoisted(() => vi.fn((children: unknown) => children));
const jsQR = vi.hoisted(() => vi.fn());
vi.mock("react-dom", () => ({ createPortal }));
vi.mock("jsqr", () => ({ default: jsQR }));

import { QrScannerDialog } from "@/features/map/components/QrScannerDialog";
import { decodeQrVideoFrame, QrDecoderUnavailableError } from "@/features/map/components/qr-decoder";

let renderer: ReactTestRenderer | null = null;
let onDecoded: ReturnType<typeof vi.fn>;
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(videoOverrides: Record<string, unknown> = {}) {
  await act(async () => {
    renderer = create(createElement(QrScannerDialog, {
      open: true,
      onClose: vi.fn(),
      onDecoded,
    }), {
      createNodeMock: (element) => element.type === "video"
        ? {
            readyState: 3,
            videoWidth: 640,
            videoHeight: 480,
            play: vi.fn(async () => undefined),
            pause: vi.fn(),
            srcObject: null,
            ...videoOverrides,
          }
        : { focus: vi.fn() },
    });
  });
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", {
    body: {},
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { mediaDevices: undefined });
  vi.stubGlobal("window", {
    BarcodeDetector: undefined,
    isSecureContext: true,
    clearTimeout: nativeClearTimeout,
    setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
  });
  onDecoded = vi.fn(async () => undefined);
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("web QR scanner lifecycle", () => {
  it("requests the camera even when BarcodeDetector is absent", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await mount();

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("decodes and submits a QR frame through the canvas fallback", async () => {
    const stop = vi.fn();
    const context = {
      canvas: { width: 0, height: 0 },
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
    };
    const canvas = { getContext: vi.fn(() => context) };
    vi.stubGlobal("document", {
      body: {},
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      createElement: vi.fn(() => canvas),
    });
    jsQR.mockReturnValue({ data: "ordinary QR text" });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });

    await mount();
    await flush();

    expect(onDecoded).toHaveBeenCalledWith("ordinary QR text");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not request a camera from an insecure context", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      isSecureContext: false,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toContain("HTTPS");
  });

  it("surfaces camera denial and releases the visibility listener on unmount", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      isSecureContext: true,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toContain("blocked");

    await act(async () => renderer?.unmount());
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("distinguishes a missing camera from permission denial", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("missing", "NotFoundError");
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      isSecureContext: true,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount();

    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toContain("No camera");
  });

  it("distinguishes a playback failure from camera acquisition failure", async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class { detect = vi.fn(async () => []); },
      isSecureContext: true,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount({ play: vi.fn(async () => { throw new Error("playback blocked"); }) });

    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toContain("preview");
  });

  it("reports an unavailable decoder after acquiring the camera", async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await mount();

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toContain("QR decoder");
  });

  it("reacquires the camera after returning from the background", async () => {
    let resolveFirst!: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void;
    const firstAttempt = new Promise<{ getTracks: () => Array<{ stop: () => void }> }>((resolve) => {
      resolveFirst = resolve;
    });
    const getUserMedia = vi.fn()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    let visibilityListener: (() => void) | undefined;
    vi.mocked(document.addEventListener).mockImplementation((event, callback) => {
      if (event === "visibilitychange") visibilityListener = callback as unknown as () => void;
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      isSecureContext: true,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount();
    expect(getUserMedia).toHaveBeenCalledOnce();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    visibilityListener?.();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    visibilityListener?.();
    expect(getUserMedia).toHaveBeenCalledOnce();
    resolveFirst({ getTracks: () => [{ stop: vi.fn() }] });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("stops an acquired stream when the scanner is unmounted", async () => {
    const stop = vi.fn();
    class DetectorStub {
      detect = vi.fn(async () => []);
    }
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
    vi.stubGlobal("window", {
      BarcodeDetector: DetectorStub,
      isSecureContext: true,
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });

    await mount();
    expect(stop).not.toHaveBeenCalled();
    await act(async () => renderer?.unmount());

    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not render typed or pasted QR entry", async () => {
    await mount();

    expect(renderer?.root.findAllByProps({ id: "qr-manual-content" })).toHaveLength(0);
    expect(renderer?.root.findAllByType("textarea")).toHaveLength(0);
    expect(renderer?.root.findAllByType("input")).toHaveLength(0);
  });

  it("uses the canvas decoder when a browser has no native BarcodeDetector", () => {
    jsQR.mockReturnValue({ data: "opaque QR content" });
    const context = {
      canvas: { width: 0, height: 0 },
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    expect(decodeQrVideoFrame(video, canvas)).toBe("opaque QR content");
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 720, 405);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 720, 405, { inversionAttempts: "attemptBoth" });
  });

  it("reports an unavailable canvas decoder distinctly", () => {
    const video = { videoWidth: 100, videoHeight: 100 } as HTMLVideoElement;
    const canvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;

    expect(() => decodeQrVideoFrame(video, canvas)).toThrow(QrDecoderUnavailableError);
  });

  it("keeps the shared validation contract executable", () => {
    expect(sharedGroupQrContentError("")).toBe("empty");
    expect(sharedGroupQrContentError("x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH + 1))).toBe("too_long");
    expect(sharedGroupQrContentError("safe\u0000text")).toBe("nul");
  });
});
