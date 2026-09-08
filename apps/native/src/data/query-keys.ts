export const nativeQueryKeys = {
  bootstrap: ["bootstrap"] as const,
  profile: {
    current: ["profile", "current"] as const,
    public: (userId: string) => ["profile", "public", userId] as const,
    socialContext: (userId: string) => ["profile", "public", userId, "social-context"] as const,
    photos: ["profile", "photos"] as const,
    interests: ["profile", "interests"] as const,
  },
  catalog: {
    interests: ["catalog", "interests"] as const,
  },
  social: {
    friends: ["social", "friends"] as const,
    requests: ["social", "requests"] as const,
  },
  inbox: {
    threads: ["inbox", "threads"] as const,
    groups: ["inbox", "groups"] as const,
  },
  chat: {
    all: ["chat"] as const,
    messages: (threadId: string) => ["chat", threadId, "messages"] as const,
    suggestions: (threadId: string) => ["chat", threadId, "suggestions"] as const,
    groupMessages: (groupId: string) => ["chat", "group", groupId, "messages"] as const,
  },
  discovery: {
    userSearch: ["discovery", "search", "users"] as const,
    nearby: (viewerId: string, lat: number, lng: number) =>
      ["discovery", "nearby", viewerId, lat.toFixed(4), lng.toFixed(4)] as const,
    bots: (viewerId: string, lat: number, lng: number) =>
      ["discovery", "bots", viewerId, lat.toFixed(4), lng.toFixed(4)] as const,
  },
  coins: ["coins"] as const,
  entitlements: ["billing", "entitlements"] as const,
  presence: ["realtime", "presence"] as const,
  availability: {
    all: ["availability"] as const,
    nearby: (radiusKm: 2 | 10 | 25, discoveryContext = false) =>
      ["availability", "nearby", radiusKm, discoveryContext ? "context-v2" : "legacy"] as const,
  },
  meetups: {
    all: ["meetups"] as const,
    peer: (peerId: string) => ["meetups", peerId] as const,
  },
  pokes: ["pokes"] as const,
  plans: {
    all: ["plans"] as const,
    detail: (planId: string) => ["plans", planId] as const,
    meetups: (planId: string, accountId: string) =>
      ["plans", planId, "meetups", accountId] as const,
  },
  admin: {
    photos: (status: string, cursor: string | null) => ["admin", "photos", status, cursor] as const,
    reports: (status: string, cursor: string | null) => ["admin", "reports", status, cursor] as const,
    coins: ["admin", "coins"] as const,
  },
} as const;

export function isNativeChatQueryKey(queryKey: readonly unknown[]) {
  return queryKey[0] === nativeQueryKeys.chat.all[0];
}

export function isNativeUserSyncQueryKey(queryKey: readonly unknown[]) {
  return isNativeChatQueryKey(queryKey)
    || queryKey[0] === nativeQueryKeys.social.friends[0]
    || queryKey[0] === nativeQueryKeys.inbox.threads[0]
    || queryKey[0] === nativeQueryKeys.inbox.groups[0];
}
