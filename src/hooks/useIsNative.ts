"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/native";

// The platform never changes mid-session — no real subscription needed.
const subscribe = () => () => {};
const getServerSnapshot = () => false;

/**
 * Hydration-safe native detection for render-time branching: false during SSR
 * and the hydration pass, the real value right after — without the
 * setState-in-effect pattern the lint config rejects.
 */
export function useIsNative(): boolean {
  return useSyncExternalStore(subscribe, isNativeApp, getServerSnapshot);
}
