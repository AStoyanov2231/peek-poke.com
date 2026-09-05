"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import type { SharedGroupSummary } from "@peekpoke/shared";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGroups, useIsGroupsLoaded, useThreads, useIsMessagesLoaded } from "@/stores/selectors";
import { type DMThreadWithParticipants } from "@/stores/appStore";
import { useAuth } from "@/features/auth/useAuth";
import { differenceInSeconds, formatDistanceToNow } from "date-fns";

function formatMessageTime(date: Date): string {
  const secondsAgo = differenceInSeconds(new Date(), date);
  if (secondsAgo < 60) return "Now";
  return formatDistanceToNow(date, { addSuffix: false });
}

interface ChatsTabProps {
  onSelectThread: (threadId: string) => void;
  onSelectGroup: (groupId: string) => void;
  activeThreadId: string | null;
  activeGroupId: string | null;
}

type ConversationItem =
  | { kind: "dm"; item: DMThreadWithParticipants; sortAt: string }
  | { kind: "group"; item: SharedGroupSummary; sortAt: string };

export function ChatsTab({ onSelectThread, onSelectGroup, activeThreadId, activeGroupId }: ChatsTabProps) {
  const router = useTransitionRouter();
  const { user } = useAuth();
  const threads = useThreads();
  const groups = useGroups();
  const messagesLoaded = useIsMessagesLoaded();
  const groupsLoaded = useIsGroupsLoaded();
  const isLoaded = messagesLoaded && groupsLoaded;
  const conversations = useMemo<ConversationItem[]>(() => [
    ...threads.map((item) => ({
      kind: "dm" as const,
      item,
      sortAt: item.last_message_at ?? item.created_at,
    })),
    ...groups.map((item) => ({
      kind: "group" as const,
      item,
      sortAt: item.last_message_at ?? item.created_at,
    })),
  ].sort((left, right) => right.sortAt.localeCompare(left.sortAt) || right.item.id.localeCompare(left.item.id)), [groups, threads]);

  function getOtherParticipant(thread: DMThreadWithParticipants) {
    return thread.participant_1_id === user?.id ? thread.participant_2 : thread.participant_1;
  }

  function handleThreadClick(threadId: string) {
    if (window.innerWidth < 768) router.push(`/chat/${threadId}`);
    else onSelectThread(threadId);
  }

  function handleGroupClick(groupId: string) {
    if (window.innerWidth < 768) router.push(`/group/${groupId}`);
    else onSelectGroup(groupId);
  }

  if (!isLoaded) {
    return (
      <div className="px-3 space-y-1 pt-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="t-body muted">No conversations yet</p>
        <p className="t-caption muted mt-1">Find friends on the map or scan a QR code to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {conversations.map((conversation) => {
        if (conversation.kind === "group") {
          const group = conversation.item;
          const isActive = group.id === activeGroupId;
          return (
            <button
              type="button"
              key={`group-${group.id}`}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 text-left transition-all rounded-xl active:scale-[0.98]",
                isActive ? "bg-ink-1" : "md:hover:bg-ink-1",
              )}
              onClick={() => handleGroupClick(group.id)}
              aria-label={`Open ${group.name}, ${group.member_count} members`}
            >
              <span className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <Users aria-hidden="true" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("t-body-b truncate", group.unread_count ? "text-ink-9" : "text-ink-8")}>{group.name}</span>
                  {group.last_message_at ? <span className="t-caption muted flex-shrink-0">{formatMessageTime(new Date(group.last_message_at))}</span> : null}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("t-caption truncate", group.unread_count ? "text-ink-8 font-medium" : "muted")}>
                    {group.last_message_preview ?? `${group.member_count} members`}
                  </span>
                  {group.unread_count ? <span className="badge flex-shrink-0" style={{ background: "var(--accent-500)", minWidth: 18, height: 18, fontSize: 12 }}>{group.unread_count > 9 ? "9+" : group.unread_count}</span> : null}
                </span>
              </span>
            </button>
          );
        }

        const thread = conversation.item;
        const otherUser = getOtherParticipant(thread);
        const name = otherUser?.display_name || otherUser?.username || "";
        const isOnline = otherUser?.is_online === true;
        const isActive = thread.id === activeThreadId;
        return (
          <div key={thread.id} className={cn("w-full flex items-center gap-3 px-3 py-3 text-left transition-all rounded-xl active:scale-[0.98]", isActive ? "bg-ink-1" : "md:hover:bg-ink-1")}>
            <button type="button" className="relative flex-shrink-0" aria-label={`View ${name}'s profile`} onClick={(e) => { e.stopPropagation(); if (otherUser?.id) router.push(`/profile/${otherUser.id}`); }}>
              <Avatar className="h-[52px] w-[52px]"><AvatarImage src={otherUser?.avatar_url || undefined} alt={name} /><AvatarFallback name={name} /></Avatar>
              {isOnline && <span className="absolute bottom-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-surface" />}
            </button>
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => handleThreadClick(thread.id)}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("t-body-b truncate", thread.unread_count ? "text-ink-9" : "text-ink-8")}>{name}</p>
                {thread.last_message_at ? <span className="t-caption muted flex-shrink-0">{formatMessageTime(new Date(thread.last_message_at))}</span> : null}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {thread.last_message_preview ? <p className={cn("t-caption truncate", thread.unread_count ? "text-ink-8 font-medium" : "muted")}>{thread.last_message_preview}</p> : null}
                {thread.unread_count ? <span className="badge flex-shrink-0" style={{ background: "var(--accent-500)", minWidth: 18, height: 18, fontSize: 12 }}>{thread.unread_count > 9 ? "9+" : thread.unread_count}</span> : null}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
