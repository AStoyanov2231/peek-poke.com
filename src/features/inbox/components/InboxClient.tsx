"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatsTab } from "@/features/inbox/components/ChatsTab";
import { PokesTab } from "@/features/inbox/components/PokesTab";
import { PlansTab } from "@/features/inbox/components/PlansTab";
import { InboxChatPanel } from "@/features/inbox/components/InboxChatPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RestoredScroll } from "@/features/layout/components/RestoredScroll";
import { useTotalUnread } from "@/stores/selectors";
import { sharedGroupsQueryOptions, threadsQueryOptions } from "@/data/web-query";
import { usePokeInbox } from "@/features/inbox/usePokeInbox";
import { InboxDataRecovery } from "@/features/inbox/components/InboxDataRecovery";

type Tab = "pokes" | "plans" | "chats";


export function InboxClient() {
  const threadsQuery = useQuery(threadsQueryOptions);
  const groupsQuery = useQuery(sharedGroupsQueryOptions);
  const { pokesQuery, pendingReceivedCount: pokeCount } = usePokeInbox();
  const router = useRouter();
  const searchParams = useSearchParams();

  const threadId = searchParams.get("thread") ?? null;
  const groupId = searchParams.get("group") ?? null;
  const unreadCount = useTotalUnread();

  const requestedTab = searchParams.get("tab");
  const localTab: Tab = requestedTab === "pokes" || requestedTab === "plans" || requestedTab === "chats"
    ? requestedTab
    : "pokes";

  const handleSetTab = useCallback(
    (newTab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", newTab);
      params.delete("thread");
      params.delete("group");
      router.replace(`/inbox?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setThread = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", id);
      params.delete("group");
      router.replace(`/inbox?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setGroup = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("group", id);
      params.delete("thread");
      router.replace(`/inbox?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  if ((threadsQuery.isError && !threadsQuery.data) || pokesQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">Your inbox could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void Promise.all([threadsQuery.refetch(), pokesQuery.refetch()])}
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
              <TabsTrigger value="pokes" className="flex-1 gap-1.5">
                Pokes
                {pokeCount > 0 && (
                  <span className="badge" style={{ background: "var(--primary-500)", fontSize: 12, minWidth: 16, height: 16 }}>
                    {pokeCount > 9 ? "9+" : pokeCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="plans" className="flex-1">
                Plans
              </TabsTrigger>
              <TabsTrigger value="chats" className="flex-1 gap-1.5">
                Messages
                {unreadCount > 0 && (
                  <span className="badge" style={{ fontSize: 12, minWidth: 16, height: 16 }}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {threadsQuery.error && threadsQuery.data ? (
          <InboxDataRecovery pending={threadsQuery.isFetching} onRetry={() => { void threadsQuery.refetch(); }} />
        ) : groupsQuery.error ? (
          <InboxDataRecovery pending={groupsQuery.isFetching} onRetry={() => { void groupsQuery.refetch(); }} />
        ) : null}

        {/* Tab content */}
        <RestoredScroll storageKey={`inbox:${localTab}`} className="flex-1 min-h-0 overflow-y-auto">
          {localTab === "pokes" && <PokesTab />}
          {localTab === "plans" && <PlansTab />}
          {localTab === "chats" && <ChatsTab onSelectThread={setThread} onSelectGroup={setGroup} activeThreadId={threadId} activeGroupId={groupId} />}
        </RestoredScroll>
      </div>

      {/* Desktop right panel */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 min-h-0">
        <InboxChatPanel threadId={threadId} groupId={groupId} tab={localTab} />
      </div>
    </div>
  );
}
