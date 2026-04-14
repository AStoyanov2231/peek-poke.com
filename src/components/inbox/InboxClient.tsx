"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChatsTab } from "@/components/inbox/ChatsTab";
import { FriendsTab } from "@/components/inbox/FriendsTab";
import { RequestsTab } from "@/components/inbox/RequestsTab";
import { InboxChatPanel } from "@/components/inbox/InboxChatPanel";
import { useFriendRequestCount } from "@/stores/selectors";

type Tab = "chats" | "friends" | "requests";

const TABS: { id: Tab; label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "friends", label: "Friends" },
  { id: "requests", label: "Requests" },
];

export function InboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const threadId = searchParams.get("thread") ?? null;
  const requestCount = useFriendRequestCount();

  // Local tab state for instant visual response — URL stays in sync for deep-linking
  const [localTab, setLocalTab] = useState<Tab>(
    () => (searchParams.get("tab") ?? "chats") as Tab
  );

  // Sync localTab when URL changes externally (e.g. back/forward, deep link)
  useEffect(() => {
    setLocalTab((searchParams.get("tab") ?? "chats") as Tab);
  }, [searchParams]);

  const handleSetTab = useCallback(
    (newTab: Tab) => {
      setLocalTab(newTab); // instant visual update
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", newTab);
      params.delete("thread");
      router.replace(`/inbox?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setThread = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", id);
      router.replace(`/inbox?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="flex h-[100svh] overflow-hidden">
      {/* Left panel: title + tabs + list */}
      <div className="flex flex-col w-full md:w-[360px] md:flex-shrink-0 md:border-r md:border-border overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pb-2 bg-background">
          <h1 className="text-[28px] font-display font-bold text-foreground">Inbox</h1>
        </div>

        {/* Tab bar */}
        <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 bg-background">
          {TABS.map(({ id, label }) => {
            const isActive = localTab === id;
            const showBadge = id === "requests" && requestCount > 0;
            return (
              <button
                key={id}
                onClick={() => handleSetTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-white shadow-neu-raised-sm"
                    : "text-muted-foreground hover:text-foreground hover:shadow-neu-raised-sm"
                )}
              >
                {label}
                {showBadge && (
                  <span className="flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {requestCount > 9 ? "9+" : requestCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {localTab === "chats" && <ChatsTab onSelectThread={setThread} activeThreadId={threadId} />}
          {localTab === "friends" && <FriendsTab />}
          {localTab === "requests" && <RequestsTab />}
        </div>
      </div>

      {/* Desktop right panel: full-height chat starting from the very top */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 min-h-0">
        <InboxChatPanel threadId={threadId} />
      </div>
    </div>
  );
}
