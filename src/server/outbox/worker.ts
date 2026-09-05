import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { profileUpdatedHintSchema } from "@peekpoke/shared";
import {
  deleteStripeCustomer,
  eraseStorageObjects,
  parseAccountStorageObjects,
  type StorageObject,
} from "@/lib/account-deletion";
import { sendPushToUser } from "@/lib/push/send";
import { broadcastPrivateRealtimeEvent } from "@/lib/realtime-broadcast";
import { createServiceClient } from "@/lib/supabase/server";
import { PRIVATE_DM_MEDIA_BUCKET } from "@/lib/storage-urls";
import {
  cleanupProfileMediaModerationOnDeadLetter,
  handleProfileMediaModeration,
} from "./profile-media";
import {
  outboxRetryDecision,
  resumableOutboxRetryDecision,
  safeOutboxError,
} from "./retry";

type OutboxEvent = {
  id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type WorkerResult = {
  claimed: number;
  completed: number;
  retried: number;
  dead: number;
  cleaned: number;
  queue_age_seconds: number;
};

function stringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Outbox payload is missing ${key}`);
  }
  return value;
}

async function handleMessageEvent(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  const threadId = stringField(event.payload, "thread_id");
  const action = stringField(event.payload, "action");
  const recipientId = typeof event.payload.recipient_id === "string"
    ? event.payload.recipient_id
    : null;
  const senderId = typeof event.payload.sender_id === "string"
    ? event.payload.sender_id
    : null;
  const actorId = typeof event.payload.actor_id === "string"
    ? event.payload.actor_id
    : senderId;
  const sequence = typeof event.payload.sequence === "number"
    ? event.payload.sequence
    : undefined;
  const userIds = [...new Set([recipientId, senderId, actorId].filter(
    (value): value is string => Boolean(value),
  ))];

  const delivered = await Promise.all(userIds.map((userId) =>
    broadcastPrivateRealtimeEvent(
      `sync:user:${userId}`,
      "messages-changed",
      {
        thread_id: threadId,
        thread_type: "dm",
        action,
        actor_id: actorId,
        ...(sequence === undefined ? {} : { sequence }),
      },
    )));
  if (delivered.some((value) => !value)) {
    throw new Error("Realtime Broadcast delivery failed");
  }

  if (action !== "sent" || !recipientId) return;
  const messageId = stringField(event.payload, "message_id");
  const { data: message, error: messageError } = await supabase
    .from("dm_messages")
    .select("content, message_type, sender_id, sender:profiles!sender_id(display_name, username)")
    .eq("id", messageId)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (messageError || !message) {
    throw messageError ?? new Error("Message no longer exists");
  }
  const sender = Array.isArray(message.sender) ? message.sender[0] : message.sender;
  const title = sender?.display_name || sender?.username || "New message";
  const body = message.message_type === "text"
    ? (message.content ?? "").slice(0, 140)
    : message.message_type === "image" ? "Sent a photo" : "Sent a message";
  await sendPushToUser(recipientId, {
    title,
    body,
    route: `/chat/${threadId}`,
    threadId,
    data: { kind: "dm", threadId, senderId: message.sender_id },
  });
}

async function handleSharedGroupMessageEvent(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  const groupId = uuidField(event.payload, "group_id");
  const action = event.payload.action;
  if (action !== "sent" && action !== "read") {
    throw new Error("Shared group message action is invalid");
  }
  const actorId = event.payload.actor_id ?? event.payload.sender_id;
  if (typeof actorId !== "string" || !UUID_VALUE.test(actorId)) {
    throw new Error("Shared group message actor is invalid");
  }
  const sequence = event.payload.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Shared group message sequence is invalid");
  }

  const recipientIds = event.payload.recipient_ids;
  if (!Array.isArray(recipientIds)) {
    throw new Error("Shared group message recipients are invalid");
  }
  const memberIds = new Set<string>();
  for (const recipientId of recipientIds) {
    if (typeof recipientId !== "string" || !UUID_VALUE.test(recipientId)) {
      throw new Error("Shared group message recipient is invalid");
    }
    memberIds.add(recipientId);
  }
  let memberList = [...memberIds];
  if (memberList.length > 0) {
    const { data: members, error: membersError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .in("user_id", memberList);
    if (membersError) throw membersError;
    const activeMemberIds = new Set(
      (members ?? [])
        .map((member) => member.user_id)
        .filter((userId): userId is string => typeof userId === "string"),
    );
    memberList = memberList.filter((userId) => activeMemberIds.has(userId));
  }
  const delivered = await Promise.all(memberList.map((userId) =>
    broadcastPrivateRealtimeEvent(
      `sync:user:${userId}`,
      "messages-changed",
      {
        thread_id: groupId,
        thread_type: "shared_group",
        action,
        actor_id: actorId,
        sequence,
      },
    )));
  if (delivered.some((value) => !value)) {
    throw new Error("Shared group realtime delivery failed");
  }

  if (action !== "sent") return;
  const messageId = uuidField(event.payload, "message_id");
  const { data: message, error: messageError } = await supabase
    .from("shared_group_messages")
    .select("content, message_type, sender_id")
    .eq("id", messageId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (messageError || !message) throw messageError ?? new Error("Shared group message no longer exists");

  const pushDeliveries: Promise<void>[] = [];
  for (const userId of memberList) {
    if (userId === message.sender_id) continue;
    pushDeliveries.push(sendPushToUser(userId, {
      title: "New shared group message",
      body: message.message_type === "text" ? (message.content ?? "").slice(0, 140) : "Sent a message",
      route: `/group/${groupId}`,
      threadId: groupId,
      data: { kind: "shared-group", groupId, senderId: message.sender_id },
    }));
  }
  await Promise.all(pushDeliveries);
}

async function handleFriendshipChanged(event: OutboxEvent) {
  const friendshipId = stringField(event.payload, "friendship_id");
  const requesterId = stringField(event.payload, "requester_id");
  const addresseeId = stringField(event.payload, "addressee_id");
  const action = stringField(event.payload, "action");
  const delivered = await Promise.all([requesterId, addresseeId].map((userId) =>
    broadcastPrivateRealtimeEvent(
      `sync:user:${userId}`,
      "friendships-changed",
      {
        changed: true,
        friendship_id: friendshipId,
        action,
      },
    )));
  if (delivered.some((value) => !value)) {
    throw new Error("Realtime Broadcast delivery failed");
  }

  if (event.payload.refund_applied === true) {
    const refundOwnerId = stringField(event.payload, "refund_owner_id");
    if (refundOwnerId !== requesterId) {
      throw new Error("Friendship refund owner does not match requester");
    }
    const refundDelivered = await broadcastPrivateRealtimeEvent(
      `sync:user:${refundOwnerId}`,
      "coins-changed",
      { changed: true, reason: "friendship_refund" },
    );
    if (!refundDelivered) {
      throw new Error("Realtime refund delivery failed");
    }
  }
}

async function handleCoinMeetingAwarded(event: OutboxEvent) {
  const meetingId = stringField(event.payload, "meeting_id");
  const userAId = stringField(event.payload, "user_a_id");
  const userBId = stringField(event.payload, "user_b_id");
  const delivered = await Promise.all([userAId, userBId].map((userId) =>
    broadcastPrivateRealtimeEvent(
      `sync:user:${userId}`,
      "coins-changed",
      { changed: true, reason: "meeting_awarded", meeting_id: meetingId },
    )));
  if (delivered.some((value) => !value)) {
    throw new Error("Realtime meeting coin delivery failed");
  }
}

async function handleProfileUpdated(
  supabase: SupabaseClient,
  event: OutboxEvent,
  workerId: string,
) {
  const profileId = profileUpdatedHintSchema.parse({
    profile_id: stringField(event.payload, "profile_id"),
  }).profile_id;
  if (event.aggregate_id !== profileId) {
    throw new Error("Profile update aggregate does not match payload");
  }

  const { data, error } = await supabase.rpc("expand_profile_updated_event", {
    p_event_id: event.id,
    p_worker_id: workerId,
  });
  if (error) throw error;
  if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
    throw new Error("Profile update fanout returned an invalid result");
  }
}

async function handleProfileUpdatedHint(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  const recipientId = profileUpdatedHintSchema.parse({
    profile_id: stringField(event.payload, "recipient_id"),
  }).profile_id;
  const hint = profileUpdatedHintSchema.parse({
    profile_id: stringField(event.payload, "profile_id"),
  });
  if (event.aggregate_id !== recipientId) {
    throw new Error("Profile hint aggregate does not match recipient");
  }

  const { data: deliverable, error } = await supabase.rpc(
    "can_deliver_profile_updated_hint",
    {
      p_profile_id: hint.profile_id,
      p_recipient_id: recipientId,
    },
  );
  if (error) throw error;
  if (deliverable !== true && deliverable !== false) {
    throw new Error("Profile hint delivery guard returned an invalid result");
  }
  if (!deliverable) return;

  const delivered = await broadcastPrivateRealtimeEvent(
    `sync:user:${recipientId}`,
    "profile-changed",
    hint,
  );
  if (!delivered) throw new Error("Realtime profile delivery failed");
}

const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DM_MEDIA_MAIN_OBJECT = new RegExp(`^(\\d{13}-${UUID_V4})\\.(?:jpg|png|webp|gif)$`);
const DM_MEDIA_THUMBNAIL_OBJECT = new RegExp(`^(\\d{13}-${UUID_V4})_thumb\\.(?:jpg|png|webp|gif)$`);
const DIGEST = /^[0-9a-f]{64}$/;
const DM_MEDIA_CLEANUP_KEYS = [
  "actor_id",
  "cleanup_id",
  "main_object_digest",
  "main_path",
  "message_id",
  "sequence",
  "thread_id",
  "thumbnail_object_digest",
  "thumbnail_path",
] as const;

function exactDmMediaCleanupPayload(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== DM_MEDIA_CLEANUP_KEYS.length
    || keys.some((key, index) => key !== DM_MEDIA_CLEANUP_KEYS[index])
  ) throw new Error("DM media cleanup payload shape is invalid");
}

function uuidField(payload: Record<string, unknown>, key: string) {
  const value = stringField(payload, key);
  if (!UUID_VALUE.test(value)) throw new Error(`Outbox payload has invalid ${key}`);
  return value;
}

function digestField(payload: Record<string, unknown>, key: string) {
  const value = stringField(payload, key);
  if (!DIGEST.test(value)) throw new Error(`Outbox payload has invalid ${key}`);
  return value;
}

function optionalStringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Outbox payload has invalid ${key}`);
  }
  return value;
}

function dmMediaPath(value: string, actorId: string, thumbnail: boolean) {
  const segments = value.split("/");
  const match = segments.length === 2 && segments[0] === actorId
    ? segments[1].match(thumbnail ? DM_MEDIA_THUMBNAIL_OBJECT : DM_MEDIA_MAIN_OBJECT)
    : null;
  if (!match) throw new Error("DM media cleanup path is not canonical");
  return { path: value, stem: match[1] };
}

async function handleDmMediaCleanup(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  exactDmMediaCleanupPayload(event.payload);
  const cleanupId = uuidField(event.payload, "cleanup_id");
  const messageId = uuidField(event.payload, "message_id");
  const threadId = uuidField(event.payload, "thread_id");
  const actorId = uuidField(event.payload, "actor_id");
  const sequence = event.payload.sequence;
  if (
    event.aggregate_id !== messageId
    || typeof sequence !== "number"
    || !Number.isSafeInteger(sequence)
    || sequence < 1
  ) throw new Error("DM media cleanup fence is invalid");

  const main = dmMediaPath(stringField(event.payload, "main_path"), actorId, false);
  const mainDigest = digestField(event.payload, "main_object_digest");
  const rawThumbnailPath = optionalStringField(event.payload, "thumbnail_path");
  const rawThumbnailDigest = event.payload.thumbnail_object_digest;
  if ((rawThumbnailPath === null) !== (rawThumbnailDigest === null)) {
    throw new Error("DM media cleanup thumbnail snapshot is incomplete");
  }
  const thumbnail = rawThumbnailPath === null
    ? null
    : dmMediaPath(rawThumbnailPath, actorId, true);
  const thumbnailDigest = rawThumbnailDigest === null
    ? null
    : digestField(event.payload, "thumbnail_object_digest");
  if (thumbnail && thumbnail.stem !== main.stem) {
    throw new Error("DM media cleanup paths are not a canonical pair");
  }

  const { data: authorized, error } = await supabase.rpc(
    "authorize_dm_media_cleanup",
    {
      p_event_id: event.id,
      p_cleanup_id: cleanupId,
      p_message_id: messageId,
      p_thread_id: threadId,
      p_actor_id: actorId,
      p_sequence: sequence,
      p_main_path: main.path,
      p_main_object_digest: mainDigest,
      p_thumbnail_path: thumbnail?.path ?? null,
      p_thumbnail_object_digest: thumbnailDigest,
    },
  );
  if (error) throw error;
  if (authorized !== true && authorized !== false) {
    throw new Error("DM media cleanup authorization returned an invalid result");
  }
  if (!authorized) return;

  const objects: StorageObject[] = [
    { bucket: PRIVATE_DM_MEDIA_BUCKET, path: main.path },
    ...(thumbnail
      ? [{ bucket: PRIVATE_DM_MEDIA_BUCKET, path: thumbnail.path }]
      : []),
  ];
  await eraseStorageObjects(supabase, objects);
}

async function handleAccountCleanup(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  const jobId = stringField(event.payload, "job_id");
  const userId = stringField(event.payload, "user_id");
  const { data: job, error } = await supabase
    .from("account_deletion_jobs")
    .select("id, stripe_customer_id, storage_objects, status")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !job) throw error ?? new Error("Deletion job not found");
  if (job.status === "completed") return;

  const { error: processingError } = await supabase
    .from("account_deletion_jobs")
    .update({ status: "processing", attempts: event.attempts, last_error: null })
    .eq("id", jobId);
  if (processingError) throw processingError;
  await deleteStripeCustomer(job.stripe_customer_id);
  await eraseStorageObjects(supabase, parseAccountStorageObjects(job.storage_objects));

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError && !/not found/i.test(authError.message)) throw authError;

  const { error: completeError } = await supabase
    .from("account_deletion_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString(), last_error: null })
    .eq("id", jobId);
  if (completeError) throw completeError;
}

async function handleCallInvite(
  supabase: SupabaseClient,
  event: OutboxEvent,
) {
  const recipientId = stringField(event.payload, "recipient_id");
  const senderId = stringField(event.payload, "sender_id");
  const threadId = stringField(event.payload, "thread_id");
  const callId = stringField(event.payload, "call_id");
  const { data: sender, error } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", senderId)
    .maybeSingle();
  if (error) throw error;
  const callerName = sender?.display_name || sender?.username || "Someone";

  // Keep this as the final database operation before the external provider.
  // The service-only RPC locks and rechecks every mutable authorization input.
  const { data: deliverable, error: deliveryError } = await supabase.rpc(
    "authorize_call_invite_delivery",
    {
      p_call_id: callId,
      p_thread_id: threadId,
      p_caller_id: senderId,
      p_callee_id: recipientId,
    },
  );
  if (deliveryError) throw deliveryError;
  if (deliverable !== true) return;
  await sendPushToUser(recipientId, {
    title: "Incoming video call",
    body: `${callerName} is calling you`,
    route: `/chat/${threadId}`,
    threadId,
    data: { kind: "call", threadId, callId, fromUserId: senderId },
  });
}

async function dispatchOutboxEvent(
  supabase: SupabaseClient,
  event: OutboxEvent,
  workerId: string,
) {
  if (event.event_type === "message.changed") {
    await handleMessageEvent(supabase, event);
    return;
  }
  if (event.event_type === "shared_group.message.changed") {
    await handleSharedGroupMessageEvent(supabase, event);
    return;
  }
  if (
    event.event_type === "friendship.requested"
    || event.event_type === "friendship.responded"
    || event.event_type === "friendship.removed"
    || event.event_type === "user.blocked"
  ) {
    await handleFriendshipChanged(event);
    return;
  }
  if (event.event_type === "coin.meeting_awarded") {
    await handleCoinMeetingAwarded(event);
    return;
  }
  if (
    event.event_type === "profile.updated"
    || event.event_type === "profile.updated.page"
  ) {
    await handleProfileUpdated(supabase, event, workerId);
    return;
  }
  if (event.event_type === "profile.updated.hint") {
    await handleProfileUpdatedHint(supabase, event);
    return;
  }
  if (event.event_type === "profile.media_moderation") {
    await handleProfileMediaModeration(supabase, event);
    return;
  }
  if (event.event_type === "account.cleanup") {
    await handleAccountCleanup(supabase, event);
    return;
  }
  if (event.event_type === "dm.media_cleanup") {
    await handleDmMediaCleanup(supabase, event);
    return;
  }
  if (event.event_type === "call.invite") {
    await handleCallInvite(supabase, event);
    return;
  }
  if (event.event_type === "billing.applied") return;
  throw new Error(`Unsupported outbox event type: ${event.event_type}`);
}

export async function processOutboxBatch(limit = 25): Promise<WorkerResult> {
  const supabase = createServiceClient();
  const workerId = `vercel:${randomUUID()}`;
  const { data: oldest, error: ageError } = await supabase
    .from("outbox_events")
    .select("created_at")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ageError) throw ageError;
  const { data, error } = await supabase.rpc("claim_outbox_events", {
    p_limit: Math.max(1, Math.min(100, limit)),
    p_worker_id: workerId,
  });
  if (error) throw error;

  const events = (Array.isArray(data) ? data : []) as OutboxEvent[];
  const result: WorkerResult = {
    claimed: events.length,
    completed: 0,
    retried: 0,
    dead: 0,
    cleaned: 0,
    queue_age_seconds: oldest?.created_at
      ? Math.max(0, Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 1_000))
      : 0,
  };

  // Events are deliberately finalized one lease at a time. Parallel handling
  // would allow the same aggregate's notifications to overtake one another.
  for (const event of events) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await dispatchOutboxEvent(supabase, event, workerId);
      const { data: completed, error: completeError } = await supabase.rpc("complete_outbox_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
      });
      if (completeError) throw completeError;
      if (completed !== true) throw new Error("Outbox lease was lost before completion");
      result.completed += 1;
    } catch (workerError) {
      let retry = outboxRetryDecision(event.attempts);
      const message = safeOutboxError(workerError);
      if (retry.dead && event.event_type === "profile.media_moderation") {
        // Active moderation operations are durable and cannot terminally fail:
        // their decision and recoverable source depend on this exact event.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const canDeadLetter = await cleanupProfileMediaModerationOnDeadLetter(supabase, event);
        if (!canDeadLetter) {
          retry = resumableOutboxRetryDecision(event.attempts);
          console.error(JSON.stringify({
            event: "profile_media_operation_retry_exhausted",
            event_id: event.id,
            operation_id: event.aggregate_id,
            attempts: event.attempts,
            next_attempt_at: retry.availableAt.toISOString(),
          }));
        }
      }
      const { data: retried, error: retryError } = await supabase.rpc("retry_outbox_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_error: message,
        p_available_at: retry.availableAt.toISOString(),
        p_dead: retry.dead,
      });
      if (retryError) throw retryError;
      if (retried !== true) throw new Error("Outbox lease was lost before retry");
      if (event.event_type === "account.cleanup") {
        const { error: jobError } = await supabase
          .from("account_deletion_jobs")
          .update({
            status: retry.dead ? "dead" : "pending",
            attempts: event.attempts,
            last_error: message,
          })
          .eq("id", event.aggregate_id);
        if (jobError) throw jobError;
      }
      if (retry.dead) result.dead += 1;
      else result.retried += 1;
    }
  }

  const { data: cleaned, error: cleanupError } = await supabase.rpc(
    "cleanup_completed_workflow_rows",
    { p_limit: 100 },
  );
  if (cleanupError) throw cleanupError;
  result.cleaned = typeof cleaned === "number" ? cleaned : 0;
  console.info(JSON.stringify({ event: "outbox_batch", ...result }));
  return result;
}
