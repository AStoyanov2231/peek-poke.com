import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient, User } from "@supabase/supabase-js";

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
  return async (
    request: NextRequest,
    routeCtx?: { params: Promise<P> }
  ) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = routeCtx
      ? await routeCtx.params
      : ({} as P);

    return handler(request, { user, supabase, params });
  };
}

export async function requireModeratorRole(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const [{ data: isMod }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("user_has_role", { p_user_id: userId, p_role_name: "moderator" }),
    supabase.rpc("user_has_role", { p_user_id: userId, p_role_name: "admin" }),
  ]);
  if (!isMod && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

export async function isBlocked(
  supabase: SupabaseClient,
  userAId: string,
  userBId: string
): Promise<boolean> {
  const [aBlockedB, bBlockedA] = await Promise.all([
    supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", userAId)
      .eq("blocked_id", userBId)
      .maybeSingle(),
    supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", userBId)
      .eq("blocked_id", userAId)
      .maybeSingle(),
  ]);
  return !!(aBlockedB.data || bBlockedA.data);
}

export async function requireAdminRole(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: isAdmin } = await supabase.rpc("user_has_role", {
    p_user_id: userId,
    p_role_name: "admin",
  });
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Verifies that userId is a participant (requester or addressee) of the given
 * friendship. Returns the friendship row on success, or null if not found / not
 * a participant — use as a route-layer authorization gate before the unfriend RPC.
 */
export async function verifyFriendshipParticipant(
  supabase: SupabaseClient,
  friendshipId: string,
  userId: string
) {
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("id", friendshipId)
    .single();

  if (
    !friendship ||
    (friendship.requester_id !== userId && friendship.addressee_id !== userId)
  ) {
    return null;
  }
  return friendship;
}

export async function hasSubscriberRole(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.rpc("user_has_role", {
    p_user_id: userId,
    p_role_name: "subscriber",
  });
  return data === true;
}
