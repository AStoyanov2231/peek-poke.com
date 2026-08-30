import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SupabaseClient, User } from "@supabase/supabase-js";
import { withRequestContext } from "@/lib/request-context";
import { apiError } from "@/lib/api-error";

type AuthContext<P = Record<string, never>> = {
  user: User;
  supabase: SupabaseClient;
  params: P;
};

export function withAuth<P = Record<string, never>>(
  handler: (
    request: NextRequest,
    ctx: AuthContext<P>
  ) => Promise<NextResponse>
) {
  return withRequestContext(async (
    request: NextRequest,
    routeCtx?: { params: Promise<P> }
  ) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Supabase access tokens remain cryptographically valid until they expire,
    // even after a global sign-out. Fail closed for soft-deleted accounts so a
    // token cached by another web/native client cannot keep using the API.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("deleted_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("auth: failed to verify account status:", profileError);
      return apiError("Internal server error", 500, "INTERNAL_ERROR");
    }

    if (!profile || profile.deleted_at) {
      return apiError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const params = routeCtx
      ? await routeCtx.params
      : ({} as P);

    return handler(request, { user, supabase, params });
  });
}

export async function requireModeratorRole(
  _supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const serviceClient = createServiceClient();
  const [{ data: isMod }, { data: isAdmin }] = await Promise.all([
    serviceClient.rpc("user_has_role", { p_user_id: userId, p_role_name: "moderator" }),
    serviceClient.rpc("user_has_role", { p_user_id: userId, p_role_name: "admin" }),
  ]);
  if (!isMod && !isAdmin) {
    return apiError("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

export async function verifyThreadParticipant(
  supabase: SupabaseClient,
  threadId: string,
  userId: string
) {
  const { data: thread } = await supabase
    .from("dm_threads")
    .select("id, participant_1_id, participant_2_id")
    .eq("id", threadId)
    .single();

  if (!thread || (thread.participant_1_id !== userId && thread.participant_2_id !== userId)) {
    return null;
  }
  return thread;
}

export async function verifyRoomMembership(
  roomId: string,
  userId: string,
) {
  const { data: membership, error } = await createServiceClient()
    .from("chat_room_members")
    .select("room_id, user_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("auth: failed to verify room membership:", error);
    throw error;
  }
  return membership;
}

export async function verifyThreadMembership(
  threadId: string,
  userId: string
) {
  // Used only by the sanitized retained-history read path. Direct DM RLS
  // intentionally hides blocked/deleted-peer rows, so raw membership must be
  // checked with the service client before route-level block enforcement.
  const { data: thread, error } = await createServiceClient()
    .from("dm_threads")
    .select("id, participant_1_id, participant_2_id")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    console.error("auth: failed to verify thread membership:", error);
    throw error;
  }

  if (!thread || (thread.participant_1_id !== userId && thread.participant_2_id !== userId)) {
    return null;
  }
  return thread;
}

export async function isBlocked(
  _supabase: SupabaseClient,
  userAId: string,
  userBId: string
): Promise<boolean> {
  // A caller-scoped client cannot see a block created by the other user under
  // the owner-only RLS policy. Use the service client so this check is truly
  // bidirectional, while returning only a boolean to the route.
  const serviceClient = createServiceClient();
  const [aBlockedB, bBlockedA] = await Promise.all([
    serviceClient
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", userAId)
      .eq("blocked_id", userBId)
      .maybeSingle(),
    serviceClient
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", userBId)
      .eq("blocked_id", userAId)
      .maybeSingle(),
  ]);
  if (aBlockedB.error || bBlockedA.error) {
    console.error(
      "auth: failed to verify block relationship:",
      aBlockedB.error ?? bBlockedA.error
    );
    throw aBlockedB.error ?? bBlockedA.error;
  }
  return !!(aBlockedB.data || bBlockedA.data);
}

export async function isDeletedProfile(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("auth: failed to verify peer account status:", error);
    throw error;
  }
  return !data || data.deleted_at !== null;
}

export async function getBlockedPeerIds(userId: string): Promise<Set<string>> {
  const { data, error } = await createServiceClient()
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error) {
    console.error("auth: failed to load block relationships:", error);
    throw error;
  }

  return new Set((data ?? []).map((row) =>
    row.blocker_id === userId ? row.blocked_id : row.blocker_id
  ));
}

export async function requireAdminRole(
  _supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: isAdmin } = await createServiceClient().rpc("user_has_role", {
    p_user_id: userId,
    p_role_name: "admin",
  });
  if (!isAdmin) {
    return apiError("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

/**
 * Verifies that userId is a participant (requester or addressee) of the given
 * friendship. Returns the friendship row on success, or null if not found / not
 * a participant — use as a route-layer authorization gate before the unfriend RPC.
 */
export async function verifyFriendshipParticipant(
  _supabase: SupabaseClient,
  friendshipId: string,
  userId: string
) {
  const { data: friendship, error } = await createServiceClient()
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("id", friendshipId)
    .maybeSingle();

  if (error) {
    console.error("auth: failed to verify friendship participant:", error);
    throw error;
  }

  if (
    !friendship ||
    (friendship.requester_id !== userId && friendship.addressee_id !== userId)
  ) {
    return null;
  }
  return friendship;
}

export async function hasSubscriberRole(
  _supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await createServiceClient().rpc("user_has_role", {
    p_user_id: userId,
    p_role_name: "subscriber",
  });
  return data === true;
}
