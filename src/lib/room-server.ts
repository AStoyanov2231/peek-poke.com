import type { RoomSummary } from "@peekpoke/shared";
import { createServiceClient } from "@/lib/supabase/server";

/** Build the public room DTO without ever selecting the QR capability. */
export async function loadRoomSummary(roomId: string, userId: string): Promise<{
  summary: RoomSummary | null;
  error: unknown;
}> {
  const service = createServiceClient();
  const [{ data: room, error: roomError }, { data: membership, error: membershipError }] = await Promise.all([
    service
      .from("chat_rooms")
      .select("id, name, created_at, last_message_at, last_message_preview, next_message_sequence")
      .eq("id", roomId)
      .maybeSingle(),
    service
      .from("chat_room_members")
      .select("last_read_sequence")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (roomError || membershipError) {
    return { summary: null, error: roomError ?? membershipError };
  }
  if (!room || !membership) return { summary: null, error: null };

  const { data: members, error: memberCountError } = await service
    .from("chat_room_members")
    .select("user_id")
    .eq("room_id", roomId);
  if (memberCountError) return { summary: null, error: memberCountError };

  const nextSequence = Number(room.next_message_sequence ?? 0);
  const lastReadSequence = Number(membership.last_read_sequence ?? 0);
  return {
    error: null,
    summary: {
      id: room.id,
      name: room.name,
      created_at: new Date(room.created_at).toISOString(),
      last_message_at: room.last_message_at ? new Date(room.last_message_at).toISOString() : null,
      last_message_preview: room.last_message_preview ?? null,
      member_count: Math.max(1, members?.length ?? 1),
      unread_count: Math.max(0, nextSequence - lastReadSequence),
    },
  };
}
