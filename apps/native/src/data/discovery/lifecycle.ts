import { useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";

export type DiscoveryActivity = {
  focused: boolean;
  appState: AppStateStatus;
};

let activity: DiscoveryActivity = {
  focused: false,
  appState: AppState.currentState,
};
const listeners = new Set<() => void>();
let appStateSubscription: { remove: () => void } | null = null;

function emit(next: DiscoveryActivity) {
  if (next.focused === activity.focused && next.appState === activity.appState) return;
  activity = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener("change", (appState) => {
      emit({ ...activity, appState });
    });
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
}

export function setDiscoveryFocused(focused: boolean) {
  emit({ ...activity, focused });
}

export function useDiscoveryActivity() {
  return useSyncExternalStore(subscribe, () => activity, () => activity);
}
