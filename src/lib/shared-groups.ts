import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessage } from "@/lib/api-contract";
import type { Message, SharedGroupSummary } from "@peekpoke/shared";

export const SHARED_GROUP_MESSAGE_COLUMNS = [
  "id",
  "group_id",
  "sender_id",
  "client_id",
  "sequence",
  "content",
  "message_type",
  "is_read",
  "is_edited",
  "is_deleted",
  "created_at",
  "sender:profiles!sender_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)",
].join(", ");

export async function getSharedGroupMembership(
  service: SupabaseClient,
  groupId: string,
  userId: string,
) {
  const { data, error } = await service
    .from("shared_group_members")
    .select("group_id, user_id, last_read_sequence")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSharedGroupSummary(
  service: SupabaseClient,
  groupId: string,
  lastReadSequence: number,
): Promise<SharedGroupSummary | null> {
  // A detail summary is built from the group row so it cannot leak another
  // member's unread cursor.
  const { data: group, error: groupError } = await service
    .from("shared_groups")
    .select("id, last_message_at, last_message_preview, created_at, next_message_sequence")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!group) return null;
  const { count, error: countError } = await service
    .from("shared_group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (countError) throw countError;
  const { count: unreadCount, error: unreadError } = await service
    .from("shared_group_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gt("sequence", lastReadSequence);
  if (unreadError) throw unreadError;
  return {
    id: group.id,
    name: "Shared group",
    member_count: count ?? 0,
    last_message_at: group.last_message_at,
    last_message_preview: group.last_message_preview,
    created_at: group.created_at,
    unread_count: unreadCount ?? 0,
  };
}

export function mapSharedGroupMessage(
  value: unknown,
  groupId: string,
  lastReadSequence?: number,
): Message {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
  const message = mapMessage({
    ...row,
    thread_id: groupId,
    reply_to_id: null,
    reply_to: null,
    sender,
  });
  return {
    ...message,
    is_read: lastReadSequence === undefined || typeof message.sequence !== "number"
      ? message.is_read
      : message.sequence <= lastReadSequence,
  };
}
