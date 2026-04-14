declare global {
  interface Window {
    isNativeApp?: boolean;
    nativePlatform?: "ios" | "android";
    navigateFromNative?: (route: string) => void;
    webkit?: {
      messageHandlers: {
        nativeBridge: {
          postMessage: (message: string) => void;
        };
      };
    };
  }
}
export {};
