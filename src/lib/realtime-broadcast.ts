import { createServiceClient } from "@/lib/supabase/server";

export async function broadcastPrivateRealtimeEvent(
  topic: string,
  event: string,
  payload: unknown
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Realtime broadcast is not configured");
    return false;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}?private=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!response.ok) {
      console.error(`Realtime broadcast to ${topic} failed: ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Realtime broadcast to ${topic} failed:`, error);
    return false;
  }
}

export async function notifyFriendshipChanged(...userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  await Promise.all(
    uniqueUserIds.map((userId) =>
      broadcastPrivateRealtimeEvent(
        `sync:user:${userId}`,
        "friendships-changed",
        { changed: true }
      )
    )
  );
}

export async function notifyMessagesChanged(
  thread: { id: string; participant_1_id: string; participant_2_id: string },
  action: "sent" | "edited" | "deleted" | "read",
  actorId: string,
) {
  await Promise.all(
    [thread.participant_1_id, thread.participant_2_id].map((userId) =>
      broadcastPrivateRealtimeEvent(
        `sync:user:${userId}`,
        "messages-changed",
        {
          thread_id: thread.id,
          actor_id: actorId,
          action,
        },
      ),
    ),
  );
}

export async function notifyRoomMessagesChanged(
  roomId: string,
  action: "sent" | "edited" | "deleted" | "read",
  actorId: string,
  sequence?: number,
): Promise<boolean> {
  return broadcastPrivateRealtimeEvent(
    `room:${roomId}`,
    "messages-changed",
    {
      room_id: roomId,
      actor_id: actorId,
      action,
      ...(sequence === undefined ? {} : { sequence }),
    },
  );
}

async function activeRoomMemberIds(roomId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const service = createServiceClient();
  const { data: members, error: memberError } = await service
    .from("chat_room_members")
    .select("user_id")
    .eq("room_id", roomId);
  if (memberError) {
    console.error("Realtime room member lookup failed:", memberError);
    return null;
  }

  const userIds = [...new Set((members ?? []).map((member) => member.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await service
    .from("profiles")
    .select("id")
    .in("id", userIds)
    .is("deleted_at", null);
  if (profileError) {
    console.error("Realtime active room member lookup failed:", profileError);
    return null;
  }
  return (profiles ?? []).map((profile) => profile.id);
}

export async function notifyRoomUnreadChanged(
  roomId: string,
  action: "sent" | "read" | "deleted",
  actorId: string,
  sequence?: number,
): Promise<boolean> {
  const memberIds = await activeRoomMemberIds(roomId);
  if (memberIds === null) return false;
  const delivered = await Promise.all(
    memberIds.map((userId) =>
      broadcastPrivateRealtimeEvent(
        `sync:user:${userId}`,
        "rooms-unread-changed",
        {
          room_id: roomId,
          actor_id: actorId,
          action,
          ...(sequence === undefined ? {} : { sequence }),
        },
      )
    ),
  );
  return delivered.every(Boolean);
}

export async function notifyRoomMembershipChanged(roomId: string): Promise<boolean> {
  const memberIds = await activeRoomMemberIds(roomId);
  if (memberIds === null) return false;
  const delivered = await Promise.all(
    memberIds.map((userId) =>
      broadcastPrivateRealtimeEvent(
        `sync:user:${userId}`,
        "rooms-membership-changed",
        { room_id: roomId },
      )
    ),
  );
  return delivered.every(Boolean);
}

export async function notifyProfileChanged(userId: string) {
  await broadcastPrivateRealtimeEvent(
    `sync:user:${userId}`,
    "profile-changed",
    { profile_id: userId },
  );
}
