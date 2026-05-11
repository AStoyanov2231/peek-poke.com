import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peekpoke.app',
  appName: 'Peek Poke',
  server: {
    // url: "https://www.peek-poke.com",
    url: "http://localhost:3000",
    cleartext: true,
  },
  ios: {
    contentInset: "never",
    scrollEnabled: true,
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
    },
    StatusBar: {
      style: "default",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;