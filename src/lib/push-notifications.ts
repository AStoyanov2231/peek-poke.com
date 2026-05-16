"use client";

import { PushNotifications, type Token, type ActionPerformed } from "@capacitor/push-notifications";
import { isNativeApp } from "@/lib/native";

const ALLOWED_DEEP_LINK_PREFIXES = ["/inbox", "/chat", "/profile", "/admin"];

let currentDeviceToken: string | null = null;

export function getCurrentPushToken(): string | null {
  return currentDeviceToken;
}

function safeRoute(route: unknown): string | null {
  if (typeof route !== "string" || !route.startsWith("/")) return null;
  return ALLOWED_DEEP_LINK_PREFIXES.some(
    (prefix) => route === prefix || route.startsWith(prefix + "/") || route.startsWith(prefix + "?")
  )
    ? route
    : null;
}

/**
 * Initialize push notifications for the signed-in user.
 * Idempotent — safe to call on every mount.
 *
 * On iOS, the OS only shows the permission prompt once per install; subsequent
 * calls to `requestPermissions` resolve immediately with the prior decision.
 *
 * @returns cleanup function that removes listeners.
 */
export async function initPushNotifications(opts: {
  onNavigate: (route: string) => void;
}): Promise<() => void> {
  if (!isNativeApp()) return () => {};

  const perm = await PushNotifications.checkPermissions();
  let status = perm.receive;
  if (status === "prompt" || status === "prompt-with-rationale") {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== "granted") return () => {};

  const handles = await Promise.all([
    PushNotifications.addListener("registration", async (token: Token) => {
      currentDeviceToken = token.value;
      try {
        const res = await fetch("/api/profile/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token: token.value, platform: "ios" }),
        });
        if (!res.ok) {
          console.error("push-token upload failed:", res.status, await res.text().catch(() => ""));
        }
      } catch (error) {
        console.error("push-token upload failed:", error);
      }
    }),
    PushNotifications.addListener("registrationError", (err) => {
      console.error("push registration error:", err);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (event: ActionPerformed) => {
      const route = safeRoute(event.notification.data?.route);
      if (route) opts.onNavigate(route);
    }),
  ]);

  await PushNotifications.register();

  return () => {
    handles.forEach((h) => h.remove().catch(() => {}));
  };
}

/**
 * Remove the current device's push token from the server.
 * Call on explicit sign-out so stale devices don't get pushes for the next user.
 */
export async function unregisterPushNotifications(token: string | null): Promise<void> {
  if (!isNativeApp() || !token) return;
  try {
    await fetch("/api/profile/push-token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    console.error("push-token delete failed:", error);
  } finally {
    currentDeviceToken = null;
  }
}
