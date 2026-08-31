import {
  API_VERSION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodeCursor,
  idempotencyKeySchema,
  moderationReportSchema,
  paginateCursor,
  profileCardSchema,
  type Friend,
  type Message,
  type ModerationPhoto,
  type ModerationReport,
  type OwnerProfilePhoto,
  type ProfileCard,
  type PublicProfile,
  type PublicProfilePhoto,
  type PublicProfileRelationship,
  type ProfileView,
  type ThreadSummary,
  type SearchUserDto,
  type RoomMessage,
  type RoomSummary,
} from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? value as RecordValue : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function utc(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapProfileCard(value: unknown): ProfileCard {
  const row = record(value);
  return {
    id: stringValue(row.id ?? row.user_id),
    username: stringValue(row.username, "unknown"),
    display_name: nullableString(row.display_name),
    avatar_url: nullableString(row.avatar_url),
    location_text: nullableString(row.location_text),
    is_online: booleanValue(row.is_online),
    last_seen_at: utc(row.last_seen_at),
    ...(Array.isArray(row.roles)
      ? { roles: row.roles.filter((item): item is string => typeof item === "string") }
      : {}),
    ...(row.account_deleted === true || typeof row.deleted_at === "string"
      ? { account_deleted: true }
      : {}),
  };
}

export function mapProfileView(value: unknown): ProfileView {
  const row = record(value);
  return {
    ...mapProfileCard(row),
    bio: nullableString(row.bio),
    cover_image_url: nullableString(row.cover_image_url),
    created_at: utc(row.created_at) ?? new Date(0).toISOString(),
    onboarding_completed: booleanValue(row.onboarding_completed),
    roles: Array.isArray(row.roles) ? row.roles.filter((item): item is string => typeof item === "string") : [],
    ...(row.account_deleted === true ? { account_deleted: true } : {}),
  };
}

export function mapFriend(value: unknown): Friend {
  const row = record(value);
  return {
    id: stringValue(row.id),
    requester_id: stringValue(row.requester_id),
    addressee_id: stringValue(row.addressee_id),
    status: row.status === "accepted" ? "accepted" : "pending",
    requested_at: utc(row.requested_at) ?? new Date(0).toISOString(),
    responded_at: utc(row.responded_at),
    ...(row.requester ? { requester: mapProfileCard(row.requester) } : {}),
    ...(row.addressee ? { addressee: mapProfileCard(row.addressee) } : {}),
  };
}

export function mapThreadSummary(value: unknown): ThreadSummary {
  const row = record(value);
  const unread = numberValue(row.unread_count ?? row.unreadCount);
  return {
    id: stringValue(row.id ?? row.thread_id),
    participant_1_id: stringValue(row.participant_1_id),
    participant_2_id: stringValue(row.participant_2_id),
    last_message_at: utc(row.last_message_at),
    last_message_preview: nullableString(row.last_message_preview),
    created_at: utc(row.created_at) ?? new Date(0).toISOString(),
    unread_count: Math.max(0, Math.trunc(unread)),
    ...(row.participant_1 ? { participant_1: mapProfileCard(row.participant_1) } : {}),
    ...(row.participant_2 ? { participant_2: mapProfileCard(row.participant_2) } : {}),
  };
}

export function mapRoomSummary(value: unknown): RoomSummary {
  const row = record(value);
  return {
    id: stringValue(row.id ?? row.room_id),
    name: stringValue(row.name, "Group room"),
    created_at: utc(row.created_at) ?? new Date(0).toISOString(),
    last_message_at: utc(row.last_message_at),
    last_message_preview: nullableString(row.last_message_preview),
    member_count: Math.max(1, Math.trunc(numberValue(row.member_count, 1))),
    unread_count: Math.max(0, Math.trunc(numberValue(row.unread_count))),
  };
}

export function mapRoomMessage(value: unknown): RoomMessage {
  const row = record(value);
  const sender = row.sender && typeof row.sender === "object"
    ? (() => {
        const senderRow = record(row.sender);
        return {
          id: stringValue(senderRow.id ?? senderRow.user_id),
          username: stringValue(senderRow.username, "unknown"),
          display_name: nullableString(senderRow.display_name),
          avatar_url: nullableString(senderRow.avatar_url),
        };
      })()
    : row.sender;
  const message = mapMessage({ ...row, thread_id: row.room_id });
  return {
    ...message,
    room_id: stringValue(row.room_id),
    ...(sender ? { sender: sender as RoomMessage["sender"] } : {}),
  };
}

export function mapMessage(value: unknown): Message {
  const row = record(value);
  const reply = record(row.reply_to);
  return {
    id: stringValue(row.id),
    thread_id: stringValue(row.thread_id),
    sender_id: stringValue(row.sender_id),
    content: nullableString(row.content),
    message_type: row.message_type === "image" || row.message_type === "system" ? row.message_type : "text",
    media_url: nullableString(row.media_url),
    media_thumbnail_url: nullableString(row.media_thumbnail_url),
    is_read: booleanValue(row.is_read),
    is_edited: booleanValue(row.is_edited),
    is_deleted: booleanValue(row.is_deleted),
    created_at: utc(row.created_at) ?? new Date(0).toISOString(),
    ...(typeof row.sequence === "number"
      ? { sequence: Math.max(0, Math.trunc(row.sequence)) }
      : {}),
    ...(typeof row.client_id === "string" ? { client_id: row.client_id } : {}),
    reply_to_id: nullableString(row.reply_to_id),
    reply_to: row.reply_to ? {
      id: stringValue(reply.id),
      sender_id: stringValue(reply.sender_id),
      content: nullableString(reply.content),
    } : null,
    ...(row.sender ? { sender: mapProfileCard(row.sender) } : {}),
  };
}

export function mapSearchUser(value: unknown): SearchUserDto {
  const row = record(value);
  const tags = Array.isArray(row.matched_tags) ? row.matched_tags : [];
  return {
    id: stringValue(row.id),
    username: stringValue(row.username, "unknown"),
    display_name: stringValue(row.display_name),
    avatar_url: nullableString(row.avatar_url),
    is_online: booleanValue(row.is_online),
    is_nearby: booleanValue(row.is_nearby),
    matched_tags: tags.map((tag) => {
      const item = record(tag);
      return { id: stringValue(item.id), name: stringValue(item.name), icon: nullableString(item.icon) };
    }),
    rank: numberValue(row.rank),
  };
}

const photoColumns = [
  "id",
  "user_id",
  "storage_path",
  "storage_bucket",
  "thumbnail_storage_path",
  "url",
  "thumbnail_url",
  "is_avatar",
  "is_cover",
  "is_private",
  "display_order",
  "created_at",
  "approval_status",
  "reviewed_by",
  "reviewed_at",
  "rejection_reason",
].join(", ");

export const PROFILE_PHOTO_COLUMNS = photoColumns;
export const MESSAGE_COLUMNS = [
  "id",
  "thread_id",
  "sender_id",
  "content",
  "message_type",
  "media_url",
  "media_thumbnail_url",
  "is_read",
  "is_edited",
  "is_deleted",
  "created_at",
  "reply_to_id",
  "reply_to",
  "sender:profiles!sender_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)",
].join(", ");
export const DURABLE_MESSAGE_COLUMNS = `${MESSAGE_COLUMNS}, sequence, client_id`;

export function mapProfilePhoto(value: unknown): ModerationPhoto {
  const row = record(value);
  const approvalStatus = row.approval_status === "approved" || row.approval_status === "rejected"
    ? row.approval_status
    : "pending";
  return {
    id: stringValue(row.id),
    user_id: stringValue(row.user_id),
    storage_path: stringValue(row.storage_path),
    storage_bucket: stringValue(row.storage_bucket, "profile-photos"),
    thumbnail_storage_path: nullableString(row.thumbnail_storage_path),
    url: approvalStatus === "rejected" ? null : nullableString(row.url),
    thumbnail_url: approvalStatus === "rejected" ? null : nullableString(row.thumbnail_url),
    is_avatar: booleanValue(row.is_avatar),
    is_cover: booleanValue(row.is_cover),
    is_private: booleanValue(row.is_private),
    display_order: Math.max(0, Math.trunc(numberValue(row.display_order))),
    created_at: utc(row.created_at) ?? new Date(0).toISOString(),
    approval_status: approvalStatus,
    reviewed_by: nullableString(row.reviewed_by),
    reviewed_at: utc(row.reviewed_at),
    rejection_reason: nullableString(row.rejection_reason),
    ...(row.user ? { user: mapProfileCard(row.user) } : {}),
    ...(row.reviewer ? { reviewer: mapProfileCard(row.reviewer) } : {}),
  };
}

export function mapModerationPhoto(value: unknown): ModerationPhoto {
  return mapProfilePhoto(value);
}

export function mapOwnerProfilePhoto(value: unknown): OwnerProfilePhoto {
  const row = record(value);
  const rejected = row.approval_status === "rejected";
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    url: rejected ? null : row.url as string | null,
    thumbnail_url: rejected ? null : row.thumbnail_url as string | null,
    is_avatar: row.is_avatar as boolean,
    is_cover: row.is_cover as boolean,
    is_private: row.is_private as boolean,
    display_order: row.display_order as number,
    created_at: utc(row.created_at) as string,
    approval_status: row.approval_status as OwnerProfilePhoto["approval_status"],
    rejection_reason: row.rejection_reason as string | null,
  };
}

export function mapPublicProfilePhoto(
  value: unknown,
  access: PublicProfilePhoto["access"],
): PublicProfilePhoto {
  const row = record(value);
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    url: access === "locked" ? null : row.url as string,
    thumbnail_url: access === "locked" ? null : row.thumbnail_url as string | null,
    is_avatar: row.is_avatar as boolean,
    is_cover: row.is_cover as boolean,
    is_private: row.is_private as boolean,
    display_order: row.display_order as number,
    created_at: utc(row.created_at) as string,
    approval_status: row.approval_status as "approved",
    access,
  };
}

export function mapPublicProfile(value: unknown): PublicProfile {
  const row = record(value);
  const roles = Array.isArray(row.roles) ? row.roles : [];
  return {
    id: row.id as string,
    username: row.username as string,
    display_name: row.display_name as string | null,
    bio: row.bio as string | null,
    avatar_url: row.avatar_url as string | null,
    cover_image_url: row.cover_image_url as string | null,
    location_text: row.location_text as string | null,
    is_online: row.is_online as boolean,
    last_seen_at: utc(row.last_seen_at),
    created_at: utc(row.created_at) as string,
    is_premium: roles.includes("subscriber"),
  };
}

export function mapPublicProfileRelationship(value: unknown): PublicProfileRelationship {
  const row = record(value);
  return {
    id: row.id as string,
    requester_id: row.requester_id as string,
    addressee_id: row.addressee_id as string,
    status: row.status as PublicProfileRelationship["status"],
    requested_at: utc(row.requested_at) as string,
    responded_at: utc(row.responded_at),
  };
}

const moderationReportDatabaseRowSchema = moderationReportSchema
  .omit({ reporter: true, reported_user: true, reviewer: true })
  .extend({
    reporter: profileCardSchema.strict().nullable(),
    reported_user: profileCardSchema.strict().nullable(),
    reviewer: profileCardSchema.strict().nullable(),
  })
  .strict();

export function mapModerationReport(value: unknown): ModerationReport {
  const row = moderationReportDatabaseRowSchema.parse(value);
  return {
    id: row.id,
    category: row.category,
    details: row.details,
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    ...(row.reporter !== null ? { reporter: row.reporter } : {}),
    ...(row.reported_user !== null ? { reported_user: row.reported_user } : {}),
    ...(row.reviewer !== null ? { reviewer: row.reviewer } : {}),
  };
}

export function parseContractPagination(request: Request, max = MAX_PAGE_SIZE) {
  const searchParams = new URL(request.url).searchParams;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
  const cursor = searchParams.get("cursor");
  if (!Number.isInteger(limit) || limit < 1 || limit > Math.min(max, MAX_PAGE_SIZE)) {
    return { data: null, error: apiError("Invalid pagination", 400, "INVALID_PAGINATION") };
  }
  if (cursor && !decodeCursor(cursor)) {
    return { data: null, error: apiError("Invalid cursor", 400, "INVALID_CURSOR") };
  }
  return { data: { limit, cursor }, error: null };
}

export function cursorPage<T>(
  request: Request,
  values: T[],
  getId: (value: T) => string,
  getSortValue: (value: T) => string,
  max = MAX_PAGE_SIZE,
) {
  const pagination = parseContractPagination(request, max);
  if (pagination.error) return { data: null, error: pagination.error };
  const sorted = values
    .map((value) => ({ value, id: getId(value), sort_value: getSortValue(value) }))
    .sort((left, right) => left.sort_value.localeCompare(right.sort_value) || left.id.localeCompare(right.id));
  const page = paginateCursor(sorted, pagination.data.limit, pagination.data.cursor);
  return {
    data: {
      items: page.items.map((item) => item.value),
      page: {
        version: API_VERSION,
        next_cursor: page.next_cursor,
        has_more: page.has_more,
        limit: pagination.data.limit,
      },
    },
    error: null,
  };
}

export function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  if (!value) return { key: null, error: null };
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    return { key: null, error: apiError("Invalid idempotency key", 400, "INVALID_IDEMPOTENCY_KEY") };
  }
  return { key: parsed.data, error: null };
}
