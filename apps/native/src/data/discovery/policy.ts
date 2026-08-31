import type { AppStateStatus } from "react-native";

export const DISCOVERY_REFRESH_INTERVAL_MS = 45_000;

export function shouldRunDiscovery(
  focused: boolean,
  appState: AppStateStatus,
  authenticated: boolean,
) {
  return focused && appState === "active" && authenticated;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
