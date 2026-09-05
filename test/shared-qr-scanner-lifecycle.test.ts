import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SHARED_GROUP_QR_CONTENT_LENGTH,
  sharedGroupQrContentError,
} from "@peekpoke/shared";

const createPortal = vi.hoisted(() => vi.fn((children: unknown) => children));
vi.mock("react-dom", () => ({ createPortal }));

import { QrScannerDialog } from "@/features/map/components/QrScannerDialog";

let renderer: ReactTestRenderer | null = null;
let onDecoded: ReturnType<typeof vi.fn>;
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;

function input() {
  if (!renderer) throw new Error("Scanner is not mounted");
  return renderer.root.findByProps({ id: "qr-manual-content" });
}

function joinButton() {
  if (!renderer) throw new Error("Scanner is not mounted");
  const button = renderer.root.findAllByType("button").find((candidate) => String(candidate.props.children) === "Join");
  if (!button) throw new Error("Join button is not mounted");
  return button;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  await act(async () => {
    renderer = create(createElement(QrScannerDialog, {
      open: true,
      onClose: vi.fn(),
      onDecoded,
    }));
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
  it("preserves opaque manual fallback input settings and text", async () => {
    await mount();
    expect(input().props.autoCapitalize).toBe("none");
    expect(input().props.autoCorrect).toBe("off");
    expect(input().props.spellCheck).toBe(false);
    const content = "  https://example.invalid/qr?id=7  \nnext line";
    await act(async () => {
      input().props.onChange({ target: { value: content } });
    });
    await act(async () => {
      joinButton().props.onClick();
    });
    await flush();
    expect(onDecoded).toHaveBeenCalledWith(content);
  });

  it("rejects oversized manual fallback input before submission", async () => {
    await mount();
    const oversized = "x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH + 1);
    await act(async () => {
      input().props.onChange({ target: { value: oversized } });
    });
    await act(async () => {
      joinButton().props.onClick();
    });
    expect(onDecoded).not.toHaveBeenCalled();
    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toBeTruthy();
  });

  it("suppresses duplicate fallback submissions while the first join is pending", async () => {
    let resolve!: () => void;
    onDecoded.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    await mount();
    await act(async () => {
      input().props.onChange({ target: { value: "plain QR text" } });
    });
    await act(async () => {
      joinButton().props.onClick();
      joinButton().props.onClick();
    });
    expect(onDecoded).toHaveBeenCalledOnce();
    resolve();
    await flush();
  });

  it("surfaces camera denial and releases camera listeners on unmount", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });
    await mount();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(renderer?.root.findByProps({ role: "alert" }).props.children).toBeTruthy();

    await act(async () => renderer?.unmount());
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
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

  it("stops an acquired stream when the camera preview cannot mount", async () => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
    vi.stubGlobal("window", {
      BarcodeDetector: class {},
      clearTimeout: nativeClearTimeout,
      setTimeout: (callback: () => void, delay?: number) => nativeSetTimeout(callback, delay),
    });
    await mount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps the shared validation contract executable", () => {
    expect(sharedGroupQrContentError("")).toBe("empty");
    expect(sharedGroupQrContentError("x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH + 1))).toBe("too_long");
    expect(sharedGroupQrContentError("safe\u0000text")).toBe("nul");
  });
});
