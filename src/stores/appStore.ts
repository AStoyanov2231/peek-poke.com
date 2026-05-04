"use client";
import { create } from "zustand";
import { COIN_SPENT_ANIMATION_MS } from "@/lib/constants";
import type {
  Profile,
  ProfilePhoto,
  ProfileInterest,
  InterestTag,
  ProfileStats,
  Friendship,
  DMThread,
  DMMessage,
  NearbyUser,
  DatingPreferences,
  Candidate,
  Match,
  MatchWithPartner,
} from "@/types/database";

export type Bot = { id: string; lat: number; lng: number };

// Thread types for unified inbox
export type DMThreadWithParticipants = DMThread & {
  type: "dm";
  participant_1: Profile;
  participant_2: Profile;
  unread_count?: number;
};

export type Thread = DMThreadWithParticipants;

export type FriendshipWithRequester = Friendship & {
  requester: Profile;
};

export type FriendshipWithAddressee = Friendship & {
  addressee: Profile;
};

// Friend profile with friendship_id for unfriend functionality
export type FriendWithFriendshipId = Profile & {
  friendship_id: string;
};

// Preload API response type
export type PreloadResponse = {
  profile: {
    profile: Profile;
    photos: ProfilePhoto[];
    interests: ProfileInterest[];
    allTags: InterestTag[];
    stats: ProfileStats;
  };
  friends: {
    friends: FriendWithFriendshipId[];
    requests: FriendshipWithRequester[];
    sentRequests: FriendshipWithAddressee[];
    sentRequestUserIds: string[];
  };
  messages: {
    threads: Thread[];
    totalUnread: number;
    blockedUserIds?: string[];
  };
  coins: {
    balance: number;
    metFriendIds: string[];
  };
};

interface AppState {
  // Profile data
  profile: Profile | null;
  photos: ProfilePhoto[];
  interests: ProfileInterest[];
  allTags: InterestTag[];
  stats: ProfileStats;

  // Friends data
  friends: FriendWithFriendshipId[];
  requests: FriendshipWithRequester[];
  sentRequests: FriendshipWithAddressee[];
  sentRequestUserIds: Set<string>; // User IDs we've sent pending requests to
  pendingFriendDeletions: Set<string>; // Track friend IDs being deleted

  // Messages data
  threads: Thread[];
  threadMessages: Record<string, DMMessage[]>;
  totalUnread: number;
  activeThreadId: string | null;

  // Coins
  coins: number;
  metFriendIds: Set<string>;

  // Blocked users
  blockedUsers: Set<string>;

  // Profile cache for real-time message enrichment
  profileCache: Record<string, Profile>;

  // Loading states
  isPreloading: boolean;
  preloadError: string | null;
  isProfileLoaded: boolean;
  isFriendsLoaded: boolean;
  isMessagesLoaded: boolean;
  mapReady: boolean;
  setMapReady: (ready: boolean) => void;

  // Actions
  preloadAll: () => Promise<void>;
  clearStore: () => void;

  // Profile actions
  setProfile: (profile: Profile) => void;
  setPhotos: (photos: ProfilePhoto[]) => void;
  setInterests: (interests: ProfileInterest[]) => void;
  setAllTags: (tags: InterestTag[]) => void;
  setStats: (stats: ProfileStats) => void;
  updateStats: (stats: Partial<ProfileStats>) => void;

  // Friends actions
  setFriends: (friends: FriendWithFriendshipId[]) => void;
  setRequests: (requests: FriendshipWithRequester[]) => void;
  setSentRequests: (sentRequests: FriendshipWithAddressee[]) => void;
  addFriend: (friend: FriendWithFriendshipId) => void;
  removeFriend: (friendId: string) => void;
  removeRequest: (requestId: string) => void;
  addSentRequest: (userId: string) => void;
  addSentRequestFull: (sentRequest: FriendshipWithAddressee) => void;
  removeSentRequest: (requestId: string) => void;
  markFriendDeletionPending: (friendId: string) => void;
  clearFriendDeletionPending: (friendId: string) => void;

  // Messages actions
  setThreads: (threads: Thread[]) => void;
  setThreadMessages: (threadId: string, messages: DMMessage[]) => void;
  addMessage: (threadId: string, message: DMMessage) => void;
  updateMessage: (threadId: string, messageId: string, updates: Partial<DMMessage>) => void;
  updateTotalUnread: (count: number) => void;
  markThreadRead: (threadId: string) => void;
  setActiveThreadId: (threadId: string | null) => void;
  removeThread: (threadId: string) => void;
  clearThreadMessages: (threadId: string) => void;

  // Coins actions
  coinSpent: boolean;
  coinSpentCount: number;
  setCoins: (n: number) => void;
  addMetFriendId: (id: string) => void;
  triggerCoinSpent: () => void;

  // Blocked users actions
  setBlockedUsers: (userIds: string[]) => void;
  addBlockedUser: (userId: string) => void;
  removeBlockedUser: (userId: string) => void;

  // Profile cache actions
  cacheProfile: (profile: Profile) => void;

  // Presence actions
  onlineUsers: Set<string>;
  setOnlineUsers: (userIds: string[]) => void;

  // Location state
  userLocation: { lat: number; lng: number } | null;
  nearbyUsers: NearbyUser[];
  visibleUsers: NearbyUser[];
  selectedClusterUserIds: string[] | null;
  highlightedUserId: string | null;
  pendingUserId: string | null;
  highlightedData: { photos: ProfilePhoto[]; interests: ProfileInterest[] } | null;
  setUserLocation: (location: { lat: number; lng: number } | null) => void;
  setNearbyUsers: (users: NearbyUser[]) => void;
  setVisibleUsers: (users: NearbyUser[]) => void;
  setSelectedClusterUserIds: (ids: string[] | null) => void;
  setHighlightedUserId: (id: string | null) => void;
  selectUser: (userId: string) => void;

  // Coin bots
  bots: Bot[];
  setBots: (bots: Bot[]) => void;
  removeBot: (id: string) => void;

  // Dating preferences
  datingPreferences: DatingPreferences | null;
  isDatingPrefsLoaded: boolean;
  fetchDatingPreferences: () => Promise<void>;
  updateDatingPreferences: (prefs: Partial<Omit<DatingPreferences, 'user_id' | 'updated_at'>>) => Promise<void>;

  // Matches
  matches: MatchWithPartner[];
  isMatchesLoaded: boolean;
  setMatches: (matches: MatchWithPartner[]) => void;
  removeMatch: (matchId: string) => void;
  fetchMatches: () => Promise<void>;

  // Discover
  candidates: Candidate[];
  currentCandidateIndex: number;
  dailyPokesRemaining: number | null;
  dailyPassesRemaining: number | null;
  lastMatch: Match | null;
  lastMatchCandidate: Candidate | null;
  isCandidatesLoaded: boolean;
  fetchCandidates: () => Promise<void>;
  poke: (pokeeId: string) => Promise<boolean>;
  pass: (passeeId: string) => Promise<boolean>;
  superPoke: (pokeeId: string) => Promise<boolean>;
  dismissMatch: () => void;
}

const initialStats: ProfileStats = {
  photos_count: 0,
  friends_count: 0,
};

let _coinSpentTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  profile: null,
  photos: [],
  interests: [],
  allTags: [],
  stats: initialStats,
  friends: [],
  requests: [],
  sentRequests: [],
  sentRequestUserIds: new Set<string>(),
  pendingFriendDeletions: new Set<string>(),
  threads: [],
  threadMessages: {},
  totalUnread: 0,
  activeThreadId: null,
  coins: 5,
  coinSpent: false,
  coinSpentCount: 0,
  metFriendIds: new Set<string>(),
  blockedUsers: new Set<string>(),
  profileCache: {},
  onlineUsers: new Set<string>(),
  isPreloading: false,
  preloadError: null,
  isProfileLoaded: false,
  isFriendsLoaded: false,
  isMessagesLoaded: false,
  mapReady: false,
  setMapReady: (ready) => set({ mapReady: ready }),
  datingPreferences: null,
  isDatingPrefsLoaded: false,
  matches: [],
  isMatchesLoaded: false,
  candidates: [],
  currentCandidateIndex: 0,
  dailyPokesRemaining: 10,
  dailyPassesRemaining: 50,
  lastMatch: null,
  lastMatchCandidate: null,
  isCandidatesLoaded: false,

  // Preload all data
  preloadAll: async () => {
    set({ isPreloading: true, preloadError: null });

    try {
      const res = await fetch("/api/preload");

      if (res.status === 401) {
        // Session expired, redirect to login
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load data");
      }

      const data: PreloadResponse = await res.json();

      // Filter out any pending deletions from the friends list
      const pendingDeletions = get().pendingFriendDeletions;
      const filteredFriends = data.friends.friends.filter(
        (f) => !pendingDeletions.has(f.id)
      );

      set({
        // Profile
        profile: data.profile.profile,
        photos: data.profile.photos,
        interests: data.profile.interests,
        allTags: data.profile.allTags,
        stats: data.profile.stats,
        isProfileLoaded: true,

        // Friends
        friends: filteredFriends,
        requests: data.friends.requests,
        sentRequests: data.friends.sentRequests || [],
        sentRequestUserIds: new Set(data.friends.sentRequestUserIds || []),
        isFriendsLoaded: true,

        // Messages
        threads: data.messages.threads,
        totalUnread: data.messages.totalUnread,
        blockedUsers: new Set(data.messages.blockedUserIds || []),
        isMessagesLoaded: true,

        // Coins
        coins: data.coins?.balance ?? 5,
        metFriendIds: new Set(data.coins?.metFriendIds || []),

        // Done loading
        isPreloading: false,
      });
    } catch (error) {
      console.error("Preload failed:", error);
      set({
        isPreloading: false,
        preloadError: "Failed to load your data. Please try again.",
      });
    }
  },

  // Clear all data (on logout)
  clearStore: () => {
    set({
      profile: null,
      photos: [],
      interests: [],
      allTags: [],
      stats: initialStats,
      friends: [],
      requests: [],
      sentRequests: [],
      sentRequestUserIds: new Set<string>(),
      pendingFriendDeletions: new Set<string>(),
      threads: [],
      threadMessages: {},
      totalUnread: 0,
      activeThreadId: null,
      coins: 5,
      coinSpentCount: 0,
      metFriendIds: new Set<string>(),
      blockedUsers: new Set<string>(),
      profileCache: {},
      onlineUsers: new Set<string>(),
      isPreloading: false,
      preloadError: null,
      isProfileLoaded: false,
      isFriendsLoaded: false,
      isMessagesLoaded: false,
      mapReady: false,
      userLocation: null,
      nearbyUsers: [],
      visibleUsers: [],
      selectedClusterUserIds: null,
      highlightedUserId: null,
      datingPreferences: null,
      isDatingPrefsLoaded: false,
      matches: [],
      isMatchesLoaded: false,
      candidates: [],
      currentCandidateIndex: 0,
      dailyPokesRemaining: 10,
      dailyPassesRemaining: 50,
      lastMatch: null,
      lastMatchCandidate: null,
      isCandidatesLoaded: false,
    });
  },

  // Profile actions
  setProfile: (profile) => set({ profile }),
  setPhotos: (photos) => set({ photos }),
  setInterests: (interests) => set({ interests }),
  setAllTags: (tags) => set({ allTags: tags }),
  setStats: (stats) => set({ stats }),
  updateStats: (partialStats) =>
    set((state) => ({ stats: { ...state.stats, ...partialStats } })),

  // Friends actions
  setFriends: (friends) =>
    set((state) => ({
      // Filter out any friends that are pending deletion to prevent them from reappearing
      friends: friends.filter((f) => !state.pendingFriendDeletions.has(f.id)),
    })),
  setRequests: (requests) => set({ requests }),
  setSentRequests: (sentRequests) => set({ sentRequests }),
  addFriend: (friend) =>
    set((state) => ({
      friends: [...state.friends, friend],
      stats: { ...state.stats, friends_count: state.stats.friends_count + 1 },
    })),
  removeFriend: (friendId) =>
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== friendId),
      stats: { ...state.stats, friends_count: Math.max(0, state.stats.friends_count - 1) },
    })),
  addSentRequest: (userId) =>
    set((state) => ({
      sentRequestUserIds: new Set(state.sentRequestUserIds).add(userId),
    })),
  addSentRequestFull: (sentRequest) =>
    set((state) => ({
      sentRequests: [...state.sentRequests, sentRequest],
      sentRequestUserIds: new Set(state.sentRequestUserIds).add(sentRequest.addressee_id),
    })),
  removeSentRequest: (requestId) =>
    set((state) => {
      const removed = state.sentRequests.find((r) => r.id === requestId);
      const nextIds = new Set(state.sentRequestUserIds);
      if (removed) nextIds.delete(removed.addressee_id);
      return {
        sentRequests: state.sentRequests.filter((r) => r.id !== requestId),
        sentRequestUserIds: nextIds,
      };
    }),
  removeRequest: (requestId) =>
    set((state) => ({
      requests: state.requests.filter((r) => r.id !== requestId),
    })),
  markFriendDeletionPending: (friendId) =>
    set((state) => ({
      pendingFriendDeletions: new Set(state.pendingFriendDeletions).add(friendId),
    })),
  clearFriendDeletionPending: (friendId) =>
    set((state) => {
      const next = new Set(state.pendingFriendDeletions);
      next.delete(friendId);
      return { pendingFriendDeletions: next };
    }),

  // Messages actions
  setThreads: (threads) => set({ threads }),
  setThreadMessages: (threadId, messages) =>
    set((state) => ({
      threadMessages: { ...state.threadMessages, [threadId]: messages },
    })),
  addMessage: (threadId, message) =>
    set((state) => {
      const existing = state.threadMessages[threadId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        threadMessages: {
          ...state.threadMessages,
          [threadId]: [...existing, message],
        },
      };
    }),
  updateMessage: (threadId, messageId, updates) =>
    set((state) => {
      const existing = state.threadMessages[threadId];
      if (!existing) return state;
      return {
        threadMessages: {
          ...state.threadMessages,
          [threadId]: existing.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
        },
      };
    }),
  updateTotalUnread: (count) => set({ totalUnread: count }),
  markThreadRead: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      const unreadReduction = thread?.unread_count || 0;
      return {
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, unread_count: 0 } : t
        ),
        totalUnread: Math.max(0, state.totalUnread - unreadReduction),
      };
    }),
  setActiveThreadId: (threadId) => set({ activeThreadId: threadId }),
  removeThread: (threadId) =>
    set((state) => ({
      threads: state.threads.filter((t) => t.id !== threadId),
      threadMessages: Object.fromEntries(
        Object.entries(state.threadMessages).filter(([id]) => id !== threadId)
      ),
    })),
  clearThreadMessages: (threadId) =>
    set((state) => ({
      threadMessages: { ...state.threadMessages, [threadId]: [] },
      threads: state.threads.map((t): Thread => {
        if (t.id !== threadId) return t;
        return { ...t, last_message_at: null, last_message_preview: null };
      }),
    })),

  // Coins actions
  setCoins: (n) => set({ coins: n }),
  triggerCoinSpent: () => {
    if (_coinSpentTimer) clearTimeout(_coinSpentTimer);
    set((s) => ({ coinSpent: true, coinSpentCount: s.coinSpentCount + 1 }));
    _coinSpentTimer = setTimeout(() => {
      set({ coinSpent: false });
      _coinSpentTimer = null;
    }, COIN_SPENT_ANIMATION_MS);
  },
  addMetFriendId: (id) =>
    set((state) => ({
      metFriendIds: new Set(state.metFriendIds).add(id),
    })),

  // Blocked users actions
  setBlockedUsers: (userIds) => set({ blockedUsers: new Set(userIds) }),
  addBlockedUser: (userId) =>
    set((state) => {
      const newBlocked = new Set(state.blockedUsers).add(userId);
      const removedFriend = state.friends.some((f) => f.id === userId);
      const newFriends = state.friends.filter((f) => f.id !== userId);
      const newFriendsCount = removedFriend
        ? Math.max(0, state.stats.friends_count - 1)
        : state.stats.friends_count;
      const newThreads = state.threads.filter(
        (t) => t.participant_1_id !== userId && t.participant_2_id !== userId
      );
      return {
        blockedUsers: newBlocked,
        friends: newFriends,
        stats: { ...state.stats, friends_count: newFriendsCount },
        threads: newThreads,
      };
    }),
  removeBlockedUser: (userId) =>
    set((state) => {
      const next = new Set(state.blockedUsers);
      next.delete(userId);
      return { blockedUsers: next };
    }),

  // Profile cache actions
  cacheProfile: (profile) =>
    set((state) => ({
      profileCache: { ...state.profileCache, [profile.id]: profile },
    })),

  // Presence actions
  setOnlineUsers: (userIds) => set((state) => {
    const next = new Set(userIds);
    const cur = state.onlineUsers;
    if (cur.size === next.size && userIds.every(id => cur.has(id))) return {};
    return { onlineUsers: next };
  }),

  // Location state
  bots: [],
  setBots: (bots) => set((state) => {
    const cur = state.bots;
    if (cur.length === bots.length && cur.every((b, i) => b.id === bots[i].id)) return {};
    return { bots };
  }),
  removeBot: (id) => set((s) => ({ bots: s.bots.filter((b) => b.id !== id) })),

  userLocation: null,
  nearbyUsers: [],
  visibleUsers: [],
  selectedClusterUserIds: null,
  highlightedUserId: null,
  pendingUserId: null,
  highlightedData: null,
  setUserLocation: (location) => set({ userLocation: location }),
  setNearbyUsers: (users) => set((state) => {
    const seeded = state.nearbyUsers.filter(u => u.userId.startsWith("dev-seed-"));
    const next = seeded.length > 0 ? [...seeded, ...users] : users;
    const cur = state.nearbyUsers;
    if (cur.length === next.length && cur.every((u, i) =>
      u.userId === next[i].userId && u.lat === next[i].lat && u.lng === next[i].lng
    )) return {};
    return { nearbyUsers: next };
  }),
  setVisibleUsers: (users) => set((state) => {
    const cur = state.visibleUsers;
    if (cur.length === users.length && cur.every((u, i) => u.userId === users[i].userId)) return {};
    return { visibleUsers: users };
  }),
  setSelectedClusterUserIds: (ids) => set({ selectedClusterUserIds: ids }),
  setHighlightedUserId: (id) => set({ highlightedUserId: id }),
  selectUser: (userId) => {
    const { pendingUserId, highlightedUserId } = get();
    if (pendingUserId === userId || highlightedUserId === userId) return;
    set({ pendingUserId: userId, highlightedData: null });
    fetch(`/api/profile/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (get().pendingUserId !== userId) return;
        set({
          highlightedData: { photos: d.photos || [], interests: d.interests || [] },
          highlightedUserId: userId,
          pendingUserId: null,
        });
      })
      .catch(() => {
        if (get().pendingUserId !== userId) return;
        set({
          highlightedData: { photos: [], interests: [] },
          highlightedUserId: userId,
          pendingUserId: null,
        });
      });
  },

  // Discover actions
  fetchCandidates: async () => {
    const { userLocation } = get();
    if (!userLocation) return;

    try {
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
        limit: "20",
      });
      const res = await fetch(`/api/dating/candidates?${params}`);
      if (!res.ok) { set({ isCandidatesLoaded: true }); return; }

      const data = (await res.json()) as {
        candidates: Candidate[];
        dailyPokesRemaining: number | null;
        dailyPassesRemaining: number | null;
      };

      set((s) => {
        const existingIds = new Set(s.candidates.map((c) => c.id));
        const newCandidates = data.candidates.filter((c) => !existingIds.has(c.id));
        return {
          candidates: [...s.candidates, ...newCandidates],
          dailyPokesRemaining: data.dailyPokesRemaining ?? s.dailyPokesRemaining,
          dailyPassesRemaining: data.dailyPassesRemaining ?? s.dailyPassesRemaining,
          isCandidatesLoaded: true,
        };
      });
    } catch {
      set({ isCandidatesLoaded: true });
    }
  },

  poke: async (pokeeId) => {
    const res = await fetch("/api/dating/poke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pokee_id: pokeeId, is_super: false }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as {
      poked: boolean;
      match: Match | null;
      dailyPokesRemaining: number | null;
    };

    const matchedCandidate = get().candidates[get().currentCandidateIndex] ?? null;
    set((s) => ({
      currentCandidateIndex: s.currentCandidateIndex + 1,
      dailyPokesRemaining: data.dailyPokesRemaining ?? s.dailyPokesRemaining,
      lastMatch: data.match ?? null,
      lastMatchCandidate: data.match ? matchedCandidate : null,
    }));

    // Refetch when running low (done outside set to avoid stale closure)
    if (get().candidates.length - get().currentCandidateIndex <= 5) {
      await get().fetchCandidates();
    }
    return true;
  },

  pass: async (passeeId) => {
    const res = await fetch("/api/dating/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passee_id: passeeId }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as {
      passed: boolean;
      dailyPassesRemaining: number | null;
    };

    set((s) => ({
      currentCandidateIndex: s.currentCandidateIndex + 1,
      dailyPassesRemaining: data.dailyPassesRemaining ?? s.dailyPassesRemaining,
    }));

    if (get().candidates.length - get().currentCandidateIndex <= 5) {
      await get().fetchCandidates();
    }
    return true;
  },

  superPoke: async (pokeeId) => {
    const res = await fetch("/api/dating/poke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pokee_id: pokeeId, is_super: true }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as {
      poked: boolean;
      match: Match | null;
      dailyPokesRemaining: number | null;
    };

    const matchedCandidate = get().candidates[get().currentCandidateIndex] ?? null;
    set((s) => ({
      currentCandidateIndex: s.currentCandidateIndex + 1,
      dailyPokesRemaining: data.dailyPokesRemaining ?? s.dailyPokesRemaining,
      lastMatch: data.match ?? null,
      lastMatchCandidate: data.match ? matchedCandidate : null,
    }));

    if (get().candidates.length - get().currentCandidateIndex <= 5) {
      await get().fetchCandidates();
    }
    return true;
  },

  dismissMatch: () => set({ lastMatch: null, lastMatchCandidate: null }),

  // Dating preferences actions
  fetchDatingPreferences: async () => {
    try {
      const res = await fetch("/api/dating/preferences");
      if (!res.ok) {
        set({ isDatingPrefsLoaded: true });
        return;
      }
      const data = await res.json();
      set({ datingPreferences: data.preferences, isDatingPrefsLoaded: true });
    } catch {
      set({ isDatingPrefsLoaded: true });
    }
  },

  updateDatingPreferences: async (prefs) => {
    try {
      const res = await fetch("/api/dating/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ datingPreferences: data.preferences });
    } catch {
      // network error — state unchanged, caller's awaited promise resolves normally
    }
  },

  // Matches actions
  setMatches: (matches) => set({ matches }),
  removeMatch: (matchId) =>
    set((state) => ({ matches: state.matches.filter((m) => m.id !== matchId) })),
  fetchMatches: async () => {
    const res = await fetch("/api/dating/matches");
    if (!res.ok) {
      set({ isMatchesLoaded: true });
      return;
    }
    const data = await res.json();
    set({ matches: data.matches ?? [], isMatchesLoaded: true });
  },
}));
