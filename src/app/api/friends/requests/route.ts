import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { cursorPage } from "@/lib/api-contract";
import {
  friendRequestsReadResponseSchema,
  MAX_PAGE_SIZE,
  utcTimestampSchema,
} from "@peekpoke/shared";
import { z } from "zod";

const friendshipProfileRowSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

const incomingFriendshipRowSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileRowSchema,
}).refine((row) => row.requester_id !== row.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const sentFriendshipRowSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  addressee: friendshipProfileRowSchema,
}).refine((row) => row.requester_id !== row.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const incomingFriendshipRowsSchema = z.array(incomingFriendshipRowSchema).max(MAX_PAGE_SIZE + 1);
const sentFriendshipRowsSchema = z.array(sentFriendshipRowSchema).max(MAX_PAGE_SIZE + 1);

export const GET = withAuth(async (request, { user }) => {
  const serviceClient = createServiceClient();
  const [incomingResult, sentResult] = await Promise.all([
    serviceClient
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requested_at, responded_at, requester:profiles!requester_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
      .eq("addressee_id", user.id)
      .eq("status", "pending")
      .limit(101),
    serviceClient
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requested_at, responded_at, addressee:profiles!addressee_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
      .eq("requester_id", user.id)
      .eq("status", "pending")
      .limit(101),
  ]);

  if (incomingResult.error || sentResult.error) {
    console.error(
      "friends/requests:",
      incomingResult.error ?? sentResult.error
    );
    return apiError("Internal server error", 500, "FRIEND_REQUESTS_FETCH_FAILED");
  }

  const incoming = incomingFriendshipRowsSchema.safeParse(incomingResult.data);
  const sent = sentFriendshipRowsSchema.safeParse(sentResult.data);
  if (
    !incoming.success
    || !sent.success
    || new Set([
      ...(incoming.success ? incoming.data.map((row) => row.id) : []),
      ...(sent.success ? sent.data.map((row) => row.id) : []),
    ]).size !== (incoming.success ? incoming.data.length : 0) + (sent.success ? sent.data.length : 0)
    || (incoming.success && incoming.data.some((row) =>
      row.addressee_id !== user.id || row.requester.id !== row.requester_id))
    || (sent.success && (
      sent.data.some((row) => row.requester_id !== user.id || row.addressee.id !== row.addressee_id)
      || new Set(sent.data.map((row) => row.addressee_id)).size !== sent.data.length
    ))
    || (incoming.success && sent.success && new Set([
      ...incoming.data.map((row) => row.requester_id),
      ...sent.data.map((row) => row.addressee_id),
    ]).size !== incoming.data.length + sent.data.length)
  ) {
    console.error("friends/requests: invalid database result");
    return apiError("Internal server error", 500, "FRIEND_REQUESTS_FETCH_FAILED");
  }

  const requests = cursorPage(request, incoming.data, (item) => item.id, (item) => item.requested_at);
  const sentRequests = cursorPage(request, sent.data, (item) => item.id, (item) => item.requested_at);
  if (requests.error) return requests.error;
  if (sentRequests.error) return sentRequests.error;
  const response = friendRequestsReadResponseSchema.safeParse({
    viewer_id: user.id,
    requests: requests.data.items,
    sentRequests: sentRequests.data.items,
    pagination: { requests: requests.data.page, sentRequests: sentRequests.data.page },
  });
  if (!response.success) {
    console.error("friends/requests: invalid response DTO");
    return apiError("Internal server error", 500, "FRIEND_REQUESTS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});
