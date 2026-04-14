/**
 * Native app detection - must be a function, not a constant.
 * Constants are evaluated at module load time (during SSR) where window is undefined.
 * Functions evaluate at call-time, when window is available on the client.
 */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && window.isNativeApp === true;
}

/**
 * Send messages to native iOS/Android app.
 * Safely handles cases where the bridge is not available.
 */
export function postToNative(
  action: string,
  payload?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  if (!window.isNativeApp) return;

  const message = JSON.stringify({ action, payload });

  // iOS WKWebView bridge
  if (window.webkit?.messageHandlers?.nativeBridge) {
    window.webkit.messageHandlers.nativeBridge.postMessage(message);
  }
}
