import { Platform } from "react-native";
import type { WebBillingMode } from "./billing-policy";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://www.peek-poke.com";

const apiBaseUrl = __DEV__ && Platform.OS === "ios"
  ? configuredApiBaseUrl.replace(/^http:\/\/10\.0\.2\.2(?=[:/]|$)/, "http://127.0.0.1")
  : configuredApiBaseUrl;

function billingMode(value: string | undefined): WebBillingMode {
  return value?.trim().toLowerCase() === "allowed" ? "allowed" : "denied";
}

function csv(value: string | undefined) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export const env = {
  apiBaseUrl,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "",
  billing: {
    platformModes: {
      ios: billingMode(process.env.EXPO_PUBLIC_IOS_WEB_BILLING_MODE),
      android: billingMode(process.env.EXPO_PUBLIC_ANDROID_WEB_BILLING_MODE),
    },
    region: process.env.EXPO_PUBLIC_BILLING_REGION?.trim() || null,
    storefront: process.env.EXPO_PUBLIC_APP_STOREFRONT?.trim() || null,
    allowedRegions: csv(process.env.EXPO_PUBLIC_WEB_BILLING_ALLOWED_REGIONS),
    allowedStorefronts: csv(process.env.EXPO_PUBLIC_WEB_BILLING_ALLOWED_STOREFRONTS),
    billingUrl: process.env.EXPO_PUBLIC_WEB_BILLING_URL ?? `${apiBaseUrl.replace(/\/$/, "")}/premium`,
  },
};

export function assertNativeEnv() {
  const missing = [];
  for (const [key, value] of Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: env.supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: env.supabaseAnonKey,
    EXPO_PUBLIC_MAPBOX_TOKEN: env.mapboxToken,
  })) {
    if (!value) missing.push(key);
  }

  if (missing.length > 0) {
    console.warn(`Missing native environment values: ${missing.join(", ")}`);
  }
}
