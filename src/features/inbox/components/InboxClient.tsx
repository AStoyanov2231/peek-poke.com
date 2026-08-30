"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatsTab } from "@/features/inbox/components/ChatsTab";
import { FriendsTab } from "@/features/inbox/components/FriendsTab";
import { RequestsTab } from "@/features/inbox/components/RequestsTab";
import { InboxChatPanel } from "@/features/inbox/components/InboxChatPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RestoredScroll } from "@/features/layout/components/RestoredScroll";
import { useFriendRequestCount, useTotalUnread } from "@/stores/selectors";
import { friendsQueryOptions, threadsQueryOptions } from "@/data/web-query";
import { InboxDataRecovery } from "@/features/inbox/components/InboxDataRecovery";

type Tab = "chats" | "friends" | "requests";


export function InboxClient() {
  const friendsQuery = useQuery(friendsQueryOptions);
  const threadsQuery = useQuery(threadsQueryOptions);
  const router = useRouter();
  const searchParams = useSearchParams();

  const threadId = searchParams.get("thread") ?? null;
  const requestCount = useFriendRequestCount();
  const unreadCount = useTotalUnread();

  const localTab = (searchParams.get("tab") ?? "chats") as Tab;

  const handleSetTab = useCallback(
    (newTab: Tab) => {
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

  if (friendsQuery.isError || (threadsQuery.isError && !threadsQuery.data)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">Your inbox could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void Promise.all([friendsQuery.refetch(), threadsQuery.refetch()])}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
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
                  <span className="badge" style={{ background: "var(--primary-500)", fontSize: 12, minWidth: 16, height: 16 }}>
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
                  <span className="badge" style={{ fontSize: 12, minWidth: 16, height: 16 }}>
                    {requestCount > 9 ? "9+" : requestCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {threadsQuery.error && threadsQuery.data ? (
          <InboxDataRecovery
            pending={threadsQuery.isFetching}
            onRetry={() => { void threadsQuery.refetch(); }}
          />
        ) : null}

        {/* Tab content */}
        <RestoredScroll storageKey={`inbox:${localTab}`} className="flex-1 min-h-0 overflow-y-auto">
          {localTab === "chats" && <ChatsTab onSelectThread={setThread} activeThreadId={threadId} />}
          {localTab === "friends" && <FriendsTab />}
          {localTab === "requests" && <RequestsTab />}
        </RestoredScroll>
      </div>

      {/* Desktop right panel */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 min-h-0">
        <InboxChatPanel threadId={threadId} />
      </div>
    </div>
  );
}
