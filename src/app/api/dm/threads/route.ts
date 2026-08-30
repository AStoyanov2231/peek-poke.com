import { NextResponse } from "next/server";
import { getBlockedPeerIds, isBlocked, withAuth } from "@/lib/auth";
import { dmThreadCreateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { filterBlockedThreads, totalUnreadForThreads } from "@/lib/blocked-data";
import { cursorPage, idempotencyKey, mapThreadSummary } from "@/lib/api-contract";
import { dmInboxResponseSchemaFor, dmThreadCreateResponseSchema, utcTimestampSchema } from "@peekpoke/shared";
import { z } from "zod";

const threadCreateRpcSuccessSchema = z.strictObject({
  id: z.uuid(),
  thread_id: z.uuid(),
  is_new: z.boolean(),
  balance: z.number().int().nonnegative(),
}).superRefine((value, context) => {
  if (value.id !== value.thread_id) {
    context.addIssue({ code: "custom", path: ["thread_id"], message: "Thread IDs differ" });
  }
});

const threadCreateRpcErrorSchema = z.strictObject({
  error: z.enum([
    "SELF_MESSAGE",
    "USER_NOT_FOUND",
    "BLOCKED",
    "ACCOUNT_DELETED",
    "INSUFFICIENT_COINS",
  ]),
  message: z.string(),
  status: z.number().int(),
});

const inboxRawProfileSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

const inboxRawThreadSchema = z.object({
  id: z.uuid(),
  participant_1_id: z.uuid(),
  participant_2_id: z.uuid(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  participant_1: inboxRawProfileSchema,
  participant_2: inboxRawProfileSchema,
}).superRefine((thread, context) => {
  if (thread.participant_1_id === thread.participant_2_id) {
    context.addIssue({ code: "custom", path: ["participant_2_id"], message: "Thread participants must differ" });
  }
  if (thread.participant_1.id !== thread.participant_1_id) {
    context.addIssue({ code: "custom", path: ["participant_1", "id"], message: "Participant profile mismatch" });
  }
  if (thread.participant_2.id !== thread.participant_2_id) {
    context.addIssue({ code: "custom", path: ["participant_2", "id"], message: "Participant profile mismatch" });
  }
});

const inboxRawRpcSchema = z.object({
  threads: z.array(inboxRawThreadSchema),
});

const cursorSequenceSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const inboxCursorRowSchema = z.strictObject({
  thread_id: z.uuid(),
  last_read_sequence: cursorSequenceSchema,
  thread: z.union([
    z.strictObject({ next_message_sequence: cursorSequenceSchema }),
    z.array(z.strictObject({ next_message_sequence: cursorSequenceSchema })).length(1),
  ]),
}).superRefine((cursor, context) => {
  const relation = Array.isArray(cursor.thread) ? cursor.thread[0] : cursor.thread;
  if (cursor.last_read_sequence > relation.next_message_sequence) {
    context.addIssue({
      code: "custom",
      path: ["last_read_sequence"],
      message: "Read cursor cannot exceed the thread sequence",
    });
  }
});

const threadCreateRawProfileSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

const threadCreateRawRowSchema = z.strictObject({
  id: z.uuid(),
  participant_1_id: z.uuid(),
  participant_2_id: z.uuid(),
  last_message_at: utcTimestampSchema.nullable(),
  last_message_preview: z.string().nullable(),
  created_at: utcTimestampSchema,
  participant_1: threadCreateRawProfileSchema,
  participant_2: threadCreateRawProfileSchema,
});

const threadCreateErrors = {
  SELF_MESSAGE: { rpcStatuses: [400], status: 400, message: "Cannot message yourself", code: "SELF_MESSAGE" },
  USER_NOT_FOUND: { rpcStatuses: [404], status: 404, message: "User not found", code: "USER_NOT_FOUND" },
  BLOCKED: { rpcStatuses: [404], status: 404, message: "User not found", code: "USER_NOT_FOUND" },
  ACCOUNT_DELETED: { rpcStatuses: [404, 410], status: 404, message: "User not found", code: "USER_NOT_FOUND" },
  INSUFFICIENT_COINS: { rpcStatuses: [403], status: 403, message: "Insufficient coins", code: "INSUFFICIENT_COINS" },
} as const;

function threadCreateFailure() {
  return apiError("Internal server error", 500, "THREAD_CREATE_FAILED");
}

function cursorInfrastructureUnavailable() {
  return apiError("Inbox temporarily unavailable", 503, "THREAD_READ_STATE_UNAVAILABLE");
}

function cursorStateCorrupt() {
  return apiError("Internal server error", 500, "THREAD_READ_STATE_CORRUPT");
}

export const GET = withAuth(async (request, { user, supabase }) => {
  const [{ data, error }, blockedPeerIds] = await Promise.all([
    createServiceClient().rpc("get_threads", { p_user_id: user.id }),
    getBlockedPeerIds(user.id),
  ]);

  if (error) {
    console.error("dm/threads:", error);
    return apiError("Internal server error", 500, "THREADS_FETCH_FAILED");
  }

  const raw = inboxRawRpcSchema.safeParse(data);
  if (!raw.success) {
    console.error("dm/threads: malformed get_threads response");
    return apiError("Internal server error", 500, "THREADS_FETCH_FAILED");
  }

  let threads = filterBlockedThreads(
    raw.data.threads.slice(0, 101),
    blockedPeerIds
  ).map((thread) => mapThreadSummary({ ...thread, unread_count: 0 }));

  const service = createServiceClient();
  const cursorBaseQuery = service
    .from("dm_thread_members")
    .select("thread_id, last_read_sequence, thread:dm_threads!inner(next_message_sequence)")
    .eq("user_id", user.id);
  const { data: cursors, error: cursorError } = threads.length > 0
    ? await cursorBaseQuery.in("thread_id", threads.map((thread) => thread.id))
    : await cursorBaseQuery.limit(0);
  if (cursorError) {
    console.error("dm/threads read cursors:", cursorError);
    return cursorInfrastructureUnavailable();
  }

  const parsedCursors = z.array(inboxCursorRowSchema).safeParse(cursors);
  if (!parsedCursors.success) {
    console.error("dm/threads: malformed read cursors");
    return cursorStateCorrupt();
  }
  const expectedThreadIds = new Set(threads.map((thread) => thread.id));
  const cursorThreadIds = new Set<string>();
  for (const cursor of parsedCursors.data) {
    if (
      cursorThreadIds.has(cursor.thread_id)
      || !expectedThreadIds.has(cursor.thread_id)
    ) {
      console.error("dm/threads: duplicate or unexpected read cursor");
      return cursorStateCorrupt();
    }
    cursorThreadIds.add(cursor.thread_id);
  }
  if (cursorThreadIds.size !== expectedThreadIds.size) {
    console.error("dm/threads: incomplete read cursor coverage");
    return cursorStateCorrupt();
  }
  const unreadByThread = new Map(
    parsedCursors.data.map((cursor) => {
      const relation = Array.isArray(cursor.thread) ? cursor.thread[0] : cursor.thread;
      return [cursor.thread_id, relation.next_message_sequence - cursor.last_read_sequence] as const;
    }),
  );
  threads = threads.map((thread) => ({
    ...thread,
    unread_count: unreadByThread.get(thread.id)!,
  }));
  const page = cursorPage(request, threads, (item) => item.id, (item) => item.last_message_at ?? item.created_at);
  if (page.error) return page.error;
  const response = dmInboxResponseSchemaFor(user.id).safeParse({
    viewer_id: user.id,
    threads: page.data.items,
    total_unread: totalUnreadForThreads(page.data.items),
    pagination: page.data.page,
  });
  if (!response.success) {
    console.error("dm/threads: malformed inbox response");
    return apiError("Internal server error", 500, "THREADS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  const limited = await enforceRateLimit("threadCreate", user.id);
  if (limited) return limited;

  const [body, err] = await parseBody(request, dmThreadCreateSchema);
  if (err) return err;
  if (body.user_id === user.id) {
    return apiError("Cannot message yourself", 400, "THREAD_CREATE_FAILED");
  }
  if (await isBlocked(supabase, user.id, body.user_id)) {
    return apiError("User not found", 404, "USER_NOT_FOUND");
  }

  const serviceClient = createServiceClient();
  const { data: target, error: targetError } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("id", body.user_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) {
    console.error("dm/threads target:", targetError);
    return threadCreateFailure();
  }
  if (!target) {
    return apiError("User not found", 404, "USER_NOT_FOUND");
  }

  const { data, error } = await serviceClient.rpc("create_or_find_thread", {
    p_user_a: user.id,
    p_user_b: body.user_id,
  });

  if (error) {
    console.error("dm/threads:", error);
    return threadCreateFailure();
  }

  if (data && typeof data === "object" && "error" in data) {
    const parsedError = threadCreateRpcErrorSchema.safeParse(data);
    if (!parsedError.success) {
      console.error("dm/threads: malformed create_or_find_thread error");
      return threadCreateFailure();
    }
    const mapped = threadCreateErrors[parsedError.data.error];
    if (!(mapped.rpcStatuses as readonly number[]).includes(parsedError.data.status)) {
      console.error("dm/threads: mismatched create_or_find_thread error status");
      return threadCreateFailure();
    }
    return apiError(mapped.message, mapped.status, mapped.code);
  }

  const rpcResult = threadCreateRpcSuccessSchema.safeParse(data);
  if (!rpcResult.success) {
    console.error("dm/threads: malformed create_or_find_thread success");
    return threadCreateFailure();
  }

  const { data: thread, error: threadError } = await serviceClient
    .from("dm_threads")
    .select("id, participant_1_id, participant_2_id, last_message_at, last_message_preview, created_at, participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at), participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
    .eq("id", rpcResult.data.id)
    .maybeSingle();
  if (threadError || !thread) {
    console.error("dm/threads requery:", threadError ?? "thread missing");
    return threadCreateFailure();
  }

  const rawThread = threadCreateRawRowSchema.safeParse(thread);
  if (!rawThread.success) {
    console.error("dm/threads: malformed raw thread requery");
    return threadCreateFailure();
  }

  const response = dmThreadCreateResponseSchema.safeParse({
    id: rpcResult.data.id,
    is_new: rpcResult.data.is_new,
    balance: rpcResult.data.balance,
    thread: mapThreadSummary(rawThread.data),
  });
  if (!response.success) {
    console.error("dm/threads: malformed thread requery");
    return threadCreateFailure();
  }
  const participants = new Set([
    response.data.thread.participant_1_id,
    response.data.thread.participant_2_id,
  ]);
  if (!participants.has(user.id) || !participants.has(body.user_id)) {
    console.error("dm/threads: thread requery participants do not match request");
    return threadCreateFailure();
  }

  return NextResponse.json(response.data, {
    headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
  });
});
