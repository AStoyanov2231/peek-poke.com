import { createServiceClient } from "@/lib/supabase/server";

export interface PushPayload {
  title: string;
  body: string;
  route?: string;
  threadId?: string;
  badge?: number;
  data?: Record<string, unknown>;
}

interface TokenEntry {
  token: string;
  platform: "ios" | "android";
  provider?: "expo" | "apns";
  owner_session_id?: string | null;
  last_registered_at?: string;
}

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isExpoToken(entry: TokenEntry) {
  return (entry.provider ?? "expo") === "expo" && entry.token.startsWith("ExpoPushToken[");
}

async function sendExpoChunk(messages: unknown[]) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Expo push failed with ${response.status}`);
  }

  return (await response.json()) as { data?: ExpoPushTicket[] };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const supabase = createServiceClient();
  const deviceResult = await supabase
    .from("push_devices")
    .select("token, platform, provider, owner_session_id, last_registered_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .limit(20);
  let existing: TokenEntry[] = deviceResult.data ?? [];
  let usesPushDevices = true;
  if (deviceResult.error?.code === "42P01" || deviceResult.error?.code === "PGRST205") {
    usesPushDevices = false;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("push_tokens")
      .eq("id", userId)
      .single();
    if (error || !profile?.push_tokens) return;
    existing = profile.push_tokens;
  } else if (deviceResult.error) {
    throw deviceResult.error;
  }
  const tokens = existing.filter(isExpoToken);
  if (tokens.length === 0) return;
  const entriesByToken = new Map(tokens.map((entry) => [entry.token, entry]));

  const messages = tokens.map((entry) => ({
    to: entry.token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    badge: payload.badge,
    data: {
      ...(payload.data ?? {}),
      ...(payload.route ? { route: payload.route } : {}),
      ...(payload.threadId ? { threadId: payload.threadId } : {}),
    },
  }));

  const invalidTokens = new Map<string, TokenEntry>();
  const rejectedTickets: string[] = [];
  const chunkResults = await Promise.all(
    chunk(messages, 100).map(async (messageChunk) => ({
      messageChunk,
      result: await sendExpoChunk(messageChunk),
    }))
  );

  for (const { messageChunk, result } of chunkResults) {
    result.data?.forEach((ticket, index) => {
      if (ticket.status === "error") {
        const token = (messageChunk[index] as { to: string }).to;
        console.error("Expo push rejected:", ticket.message, ticket.details);
        if (ticket.details?.error === "DeviceNotRegistered") {
          const entry = entriesByToken.get(token);
          if (entry) invalidTokens.set(token, entry);
        } else {
          rejectedTickets.push(ticket.details?.error ?? ticket.message ?? "unknown");
        }
      }
    });
  }

  if (invalidTokens.size > 0) {
    await Promise.all(
      [...invalidTokens].map(async ([token, entry]) => {
        if (!usesPushDevices) {
          const { error } = await supabase.rpc("delete_push_token", {
            p_user_id: userId,
            p_token: token,
          });
          if (error) throw error;
          return;
        }

        if (!entry.last_registered_at) {
          throw new Error("Push device registration fence is missing");
        }

        const update = supabase
          .from("push_devices")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("token", token)
          .eq("last_registered_at", entry.last_registered_at)
          .is("revoked_at", null);
        const { error } = entry.owner_session_id
          ? await update.eq("owner_session_id", entry.owner_session_id)
          : await update.is("owner_session_id", null);
        if (error) throw error;
      })
    );
  }
  if (rejectedTickets.length > 0) {
    throw new Error(`Expo push rejected ${rejectedTickets.length} notification(s)`);
  }
}
