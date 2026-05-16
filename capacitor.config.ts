import type { CapacitorConfig } from '@capacitor/cli';

// Use `CAP_ENV=development npx cap sync` (or NODE_ENV=development) for local dev builds.
// Production (App Store) builds omit CAP_ENV so they default to the live URL.
// On a physical device, set DEV_HOST to your Mac's LAN IP, e.g.:
//   DEV_HOST=192.168.100.2 CAP_ENV=development npx run cap:sync
const isDev =
  process.env.CAP_ENV === "development" ||
  process.env.NODE_ENV === "development";

const devHost = process.env.DEV_HOST ?? "localhost";

const config: CapacitorConfig = {
  appId: 'com.peekpoke.app',
  appName: 'Peek Poke',
  server: isDev
    ? { url: `http://${devHost}:3000`, cleartext: true }
    : { url: "https://www.peek-poke.com" },
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