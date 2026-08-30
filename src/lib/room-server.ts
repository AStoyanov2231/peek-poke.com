import { roomSummarySchema, type RoomSummary } from "@peekpoke/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Build the public room DTO without ever selecting the QR capability. */
export async function loadRoomSummary(roomId: string, client: SupabaseClient): Promise<{
  summary: RoomSummary | null;
  error: unknown;
}> {
  const { data, error } = await client.rpc("get_chat_room_summary", {
    p_room_id: roomId,
  });
  if (error) return { summary: null, error };
  if (data === null) return { summary: null, error: null };
  const parsed = roomSummarySchema.safeParse(data);
  if (!parsed.success) return { summary: null, error: new Error("Invalid room summary") };
  return { summary: parsed.data, error: null };
}
