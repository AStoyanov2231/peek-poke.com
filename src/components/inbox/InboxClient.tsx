"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatsTab } from "@/components/inbox/ChatsTab";
import { FriendsTab } from "@/components/inbox/FriendsTab";
import { RequestsTab } from "@/components/inbox/RequestsTab";
import { InboxChatPanel } from "@/components/inbox/InboxChatPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriendRequestCount, useTotalUnread } from "@/stores/selectors";

type Tab = "chats" | "friends" | "requests";


export function InboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const threadId = searchParams.get("thread") ?? null;
  const requestCount = useFriendRequestCount();
  const unreadCount = useTotalUnread();

  const [localTab, setLocalTab] = useState<Tab>(
    () => (searchParams.get("tab") ?? "chats") as Tab
  );

  useEffect(() => {
    setLocalTab((searchParams.get("tab") ?? "chats") as Tab);
  }, [searchParams]);

  const handleSetTab = useCallback(
    (newTab: Tab) => {
      setLocalTab(newTab);
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
      {/* Left panel */}
      <div className="flex flex-col w-full md:w-[360px] md:flex-shrink-0 md:border-r md:border-hairline bg-background overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
          <h1 className="t-title-1 text-ink-9">Inbox</h1>
        </div>

        {/* Segmented tab bar */}
        <div className="flex-shrink-0 px-4 pb-3">
          <Tabs value={localTab} onValueChange={(v) => handleSetTab(v as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="chats" className="flex-1 gap-1.5">
                Chats
                {unreadCount > 0 && (
                  <span className="badge" style={{ background: "var(--primary-500)", fontSize: 10, minWidth: 16, height: 16 }}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="friends" className="flex-1">
                Friends
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-1 gap-1.5">
                Requests
                {requestCount > 0 && (
                  <span className="badge" style={{ fontSize: 10, minWidth: 16, height: 16 }}>
                    {requestCount > 9 ? "9+" : requestCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {localTab === "chats" && <ChatsTab onSelectThread={setThread} activeThreadId={threadId} />}
          {localTab === "friends" && <FriendsTab />}
          {localTab === "requests" && <RequestsTab />}
        </div>
      </div>

      {/* Desktop right panel */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 min-h-0">
        <InboxChatPanel threadId={threadId} />
      </div>
    </div>
  );
}
