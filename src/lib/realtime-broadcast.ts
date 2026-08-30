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

export async function notifyProfileChanged(userId: string) {
  await broadcastPrivateRealtimeEvent(
    `sync:user:${userId}`,
    "profile-changed",
    { profile_id: userId },
  );
}
