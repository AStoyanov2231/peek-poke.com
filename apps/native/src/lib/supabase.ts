import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { createRealtimeAuthSynchronizer, type RealtimeAuthSession } from "./realtime-auth";
import { secureStorage } from "./secure-storage";

const projectRef = new URL(env.supabaseUrl).hostname.split(".")[0];
const authStorageKey = `sb-${projectRef}-auth-token`;

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    storageKey: authStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

const realtimeAuth = createRealtimeAuthSynchronizer((token) =>
  supabase.realtime.setAuth(token));

export function syncNativeRealtimeAuthSession(session: RealtimeAuthSession) {
  return realtimeAuth.session(session);
}

export function clearNativeRealtimeAuthSession() {
  return realtimeAuth.anonymous();
}

export async function clearPersistedAuthSession() {
  await Promise.allSettled([
    secureStorage.removeItem(authStorageKey),
    secureStorage.removeItem(`${authStorageKey}-code-verifier`),
    secureStorage.removeItem(`${authStorageKey}-user`),
  ]);
}
