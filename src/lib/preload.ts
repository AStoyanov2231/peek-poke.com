import type {
  Profile,
  ProfilePhoto,
  ProfileInterest,
  InterestTag,
  ProfileStats,
  DMMessage,
} from "@/types/database";
import { SupabaseClient } from "@supabase/supabase-js";
import type {
  DMThreadWithParticipants,
  Thread,
  FriendshipWithRequester,
  FriendshipWithAddressee,
} from "@/stores/appStore";

export async function fetchUserStats(supabase: SupabaseClient, userId: string): Promise<ProfileStats> {
  const [photosResult, friendsResult] = await Promise.all([
    supabase
      .from("profile_photos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
  ]);
  return {
    photos_count: photosResult.count ?? 0,
    friends_count: friendsResult.count ?? 0,
  };
}

export async function fetchUserInterests(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profile_interests")
    .select("*, tag:interest_tags(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return { interests: (data as ProfileInterest[]) || [], error };
}

export async function fetchProfileData(supabase: SupabaseClient, userId: string) {
  const [profileResult, rolesResult, photosResult, interestsResult, tagsResult, stats] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, location_text, is_online, last_seen_at, created_at, stripe_customer_id, onboarding_completed")
        .eq("id", userId)
        .single(),

      supabase.rpc("get_user_roles", { p_user_id: userId }),

      supabase
        .from("profile_photos")
        .select("*")
        .eq("user_id", userId)
        .order("display_order", { ascending: true }),

      fetchUserInterests(supabase, userId),

      supabase
        .from("interest_tags")
        .select("*")
        .order("display_order", { ascending: true }),

      fetchUserStats(supabase, userId),
    ]);

  if (rolesResult.error) {
    console.error("Failed to fetch user roles:", rolesResult.error);
  }
  const profile = profileResult.data ? {
    ...profileResult.data,
    roles: rolesResult.data || ["user"]
  } as Profile : null;
  const photos = (photosResult.data as ProfilePhoto[]) || [];
  const interests = interestsResult.interests;
  const allTags = (tagsResult.data as InterestTag[]) || [];

  return { profile, photos, interests, allTags, stats };
}

export async function fetchFriendsData(supabase: SupabaseClient, userId: string) {
  const [friendsResult, requestsResult, sentRequestsResult] = await Promise.all([
    supabase
      .from("friendships")
      .select(
        "*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)"
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted"),
    supabase
      .from("friendships")
      .select("*, requester:profiles!requester_id(*)")
      .eq("addressee_id", userId)
      .eq("status", "pending"),
    supabase
      .from("friendships")
      .select("*, addressee:profiles!addressee_id(*)")
      .eq("requester_id", userId)
      .eq("status", "pending"),
  ]);

  const friends = (friendsResult.data || []).map((f) => ({
    ...(f.requester_id === userId ? f.addressee : f.requester),
    friendship_id: f.id,
  }));

  const requests = (requestsResult.data || []) as FriendshipWithRequester[];
  const sentRequests = (sentRequestsResult.data || []) as FriendshipWithAddressee[];
  const sentRequestUserIds = sentRequests.map((r) => r.addressee_id);

  return { friends, requests, sentRequests, sentRequestUserIds };
}

export async function fetchMessagesData(supabase: SupabaseClient, userId: string) {
  // Fetch blocked user IDs first
  const { data: blocksData } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId);

  const blockedUserIds = (blocksData || []).map((b: { blocked_id: string }) => b.blocked_id);
  const blockedIds = new Set(blockedUserIds);

  const { data: dmThreadsRaw } = await supabase
    .from("dm_threads")
    .select(
      "*, participant_1:profiles!participant_1_id(*), participant_2:profiles!participant_2_id(*)"
    )
    .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  // Filter out threads with blocked users
  const filteredDmThreads = (dmThreadsRaw || []).filter(
    (t: { participant_1_id: string; participant_2_id: string }) =>
      !blockedIds.has(t.participant_1_id) && !blockedIds.has(t.participant_2_id)
  );

  const threadIds = filteredDmThreads.map((t) => t.id);
  const threadMessages: Record<string, DMMessage[]> = {};

  // Batch fetch unread counts in a single query instead of N+1
  const unreadMap = new Map<string, number>();
  if (threadIds.length > 0) {
    const { data: unreadRows } = await supabase
      .from("dm_messages")
      .select("thread_id")
      .in("thread_id", threadIds)
      .neq("sender_id", userId)
      .eq("is_read", false)
      .eq("is_deleted", false);

    for (const row of unreadRows || []) {
      unreadMap.set(row.thread_id, (unreadMap.get(row.thread_id) || 0) + 1);
    }
  }

  // Fetch last 20 messages per thread (still parallel, but unread counts are batched)
  await Promise.all(
    filteredDmThreads.map(async (thread) => {
      const { data: messages } = await supabase
        .from("dm_messages")
        .select("*, sender:profiles(*)")
        .eq("thread_id", thread.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(20);

      threadMessages[thread.id] = (messages || []).reverse() as DMMessage[];
    })
  );

  const threads: Thread[] = filteredDmThreads.map((thread) => ({
    ...thread,
    type: "dm" as const,
    unread_count: unreadMap.get(thread.id) || 0,
  }));

  threads.sort(
    (a, b) =>
      new Date(b.last_message_at || 0).getTime() -
      new Date(a.last_message_at || 0).getTime()
  );

  const totalUnread = threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);

  return {
    threads,
    threadMessages,
    totalUnread,
    blockedUserIds,
  };
}
