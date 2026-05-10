declare global {
  interface Window {
    // Legacy flag kept for compatibility during any residual usages.
    // Prefer Capacitor.isNativePlatform() via isNativeApp() from @/lib/native.
    isNativeApp?: boolean;
  }
}
export {};
