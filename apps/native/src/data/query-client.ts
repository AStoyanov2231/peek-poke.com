import { AppState, type AppStateStatus } from "react-native";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { safeQueryRetryDelay, shouldRetrySafeQuery } from "@peekpoke/shared";

export const nativeQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetrySafeQuery,
      retryDelay: safeQueryRetryDelay,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

let appStateSubscription: { remove: () => void } | null = null;

export function bindNativeQueryLifecycle() {
  if (appStateSubscription) return () => undefined;

  const updateFocus = (state: AppStateStatus) => {
    const active = state === "active";
    focusManager.setFocused(active);
    if (active) {
      // Resume paused reads so the transport can confirm connectivity. A
      // network failure immediately flips this back to offline in apiFetch.
      onlineManager.setOnline(true);
    }
  };
  updateFocus(AppState.currentState);
  appStateSubscription = AppState.addEventListener("change", updateFocus);

  return () => {
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}

export function clearNativeServerState() {
  nativeQueryClient.clear();
}
