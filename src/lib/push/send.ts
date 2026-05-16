import apn from "@parse/node-apn";
import { createServiceClient } from "@/lib/supabase/server";
import { getApnsProvider, getBundleId } from "./apns";

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link route handled by initPushNotifications onNavigate (e.g. /chat/<threadId>). */
  route?: string;
  /** Optional thread/group key so iOS coalesces related pushes. */
  threadId?: string;
  /** Optional unread count to set on the app icon badge. */
  badge?: number;
  /** Extra free-form data delivered to the app. */
  data?: Record<string, unknown>;
}

interface TokenEntry {
  token: string;
  platform: "ios" | "android";
}

/**
 * Send a push to all of a user's registered iOS devices.
 * Removes tokens that APNs reports as invalid (410 Unregistered).
 *
 * Failures are logged but never thrown — pushes are best-effort.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!process.env.APNS_KEY_ID) return; // Push not configured — skip silently.

  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("push_tokens")
    .eq("id", userId)
    .single();

  if (error || !profile?.push_tokens) return;

  const tokens: TokenEntry[] = profile.push_tokens.filter(
    (t: TokenEntry) => t.platform === "ios" && typeof t.token === "string"
  );
  if (tokens.length === 0) return;

  const note = new apn.Notification();
  note.topic = getBundleId();
  note.alert = { title: payload.title, body: payload.body };
  note.sound = "default";
  if (payload.threadId) note.threadId = payload.threadId;
  if (typeof payload.badge === "number") note.badge = payload.badge;
  note.payload = {
    ...(payload.data ?? {}),
    ...(payload.route ? { route: payload.route } : {}),
  };

  try {
    const result = await getApnsProvider().send(note, tokens.map((t) => t.token));

    // Prune invalid tokens (status 410 = device unregistered).
    const invalid = result.failed
      .filter((f) => Number(f.status) === 410 || f.response?.reason === "Unregistered")
      .map((f) => f.device);

    if (invalid.length > 0) {
      const remaining = tokens.filter((t) => !invalid.includes(t.token));
      await supabase
        .from("profiles")
        .update({ push_tokens: remaining })
        .eq("id", userId);
    }
  } catch (err) {
    console.error("sendPushToUser failed:", err);
  }
}
