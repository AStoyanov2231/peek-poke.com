import { router } from "expo-router";
import { observeMeetingAuthOwner } from "@/data/api";
import { observeReadReceiptAuthOwner } from "@/data/read-receipt";
import { clearNativeServerState } from "@/data/query-client";
import {
  captureCurrentPushAuth,
  unregisterForPushNotifications,
} from "@/lib/push";
import { createUnauthorizedSessionRecovery } from "@/lib/session-recovery-policy";
import {
  clearNativeRealtimeAuthSession,
  clearPersistedAuthSession,
  supabase,
} from "@/lib/supabase";
import { useAppStore } from "@/state/app-store";
import { useCallStore } from "@/state/call-store";

let deactivateAuthenticatedUi: (() => void) | null = null;
let unauthorizedRecoveryActive = false;
let unauthorizedRecoveryPromise: Promise<void> | null = null;

export function bindUnauthorizedSessionUiDeactivation(listener: () => void) {
  deactivateAuthenticatedUi = listener;
  return () => {
    if (deactivateAuthenticatedUi === listener) deactivateAuthenticatedUi = null;
  };
}

export function isUnauthorizedSessionRecoveryActive() {
  return unauthorizedRecoveryActive;
}

const runUnauthorizedSessionRecovery = createUnauthorizedSessionRecovery({
  deactivateAuthenticatedUi: () => deactivateAuthenticatedUi?.(),
  clearServerState: clearNativeServerState,
  resetAppState: () => useAppStore.getState().reset(),
  resetCallState: () => useCallStore.getState().reset(),
  unregisterPush: async () => undefined,
  stopAuthRefresh: () => supabase.auth.stopAutoRefresh(),
  signOutLocally: () => supabase.auth.signOut({ scope: "local" }),
  clearPersistedSession: clearPersistedAuthSession,
  clearRealtimeSession: async () => {
    await Promise.allSettled([
      supabase.removeAllChannels(),
      clearNativeRealtimeAuthSession(),
    ]);
  },
  replaceWithLogin: () => router.replace("/(auth)/login"),
  reportError: (label, error) => console.warn(`Unauthorized recovery ${label} failed:`, error),
});

export function recoverUnauthorizedSession() {
  observeMeetingAuthOwner(null);
  observeReadReceiptAuthOwner(null);
  if (unauthorizedRecoveryPromise) return unauthorizedRecoveryPromise;

  unauthorizedRecoveryActive = true;
  const pushCleanup = unregisterForPushNotifications(captureCurrentPushAuth());
  unauthorizedRecoveryPromise = runUnauthorizedSessionRecovery({
    unregisterPush: () => pushCleanup,
  }).finally(() => {
    unauthorizedRecoveryActive = false;
    unauthorizedRecoveryPromise = null;
  });
  return unauthorizedRecoveryPromise;
}
