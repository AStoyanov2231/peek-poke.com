import { Capacitor } from '@capacitor/core';

/**
 * Returns true when running inside the native iOS/Android Capacitor shell.
 * Safe to call during SSR — Capacitor's exports handle the server-side case.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
